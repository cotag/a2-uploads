
import {CondoApi} from './condo-api';
import {Upload, State, CloudStorage} from './upload';
import {Md5Workers} from './md5-workers';


export class OpenStack extends CloudStorage {
    static lookup: string = 'OpenStackSwift';

    // 2MB part size
    private _partSize: number = 2097152;


    constructor(api: CondoApi, upload: Upload, workers: Md5Workers, completeCB: any) {
        super(api, upload, workers, completeCB);
    }


    protected _start() {
        var self = this;

        if (self._strategy === undefined) {
            self.state = State.Uploading;

            // Prevents this function being called twice
            self._strategy = null;

            // Update part size
            // Not because we have to, no limits as such with openstack
            // This ensures requests don't break any limits on our system
            if ((self._partSize * 9999) < self.size) {
                self._partSize = self.size / 9999;

                // 5GB limit on part sizes (this is a limit on openstack)
                if (self._partSize > (5 * 1024 * 1024 * 1024)) {
                    self._upload.cancel();
                    self._defaultError('file exceeds maximum size');
                    return;
                }
            }

            self._processPart(1).then((result) => {
                if (self.state !== State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                }

                self._api.create({ file_id: result.md5 })
                    .subscribe((response) => {
                        self._strategy = response.type;
                        if (response.type === 'direct_upload') {
                            self._direct(response, result);
                        } else {
                            self._resume(response, result);
                        }
                    }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
        } else if (self.state === State.Paused) {
            self._resume();
        }
    }


    // Calculates the MD5 of the part of the file we are uploading
    private _processPart(part: number) {
        var self = this;

        return self._hashData(part.toString(), () => {
            var data: any,
                endbyte: number;

            // Calculate the part of the file that requires hashing
            if (self.size > self._partSize) {
                endbyte = part * self._partSize;
                if (endbyte > self.size) {
                    endbyte = self.size;
                }
                data = self._file.slice((part - 1) * self._partSize, endbyte);
            } else {
                data = self._file;
            }

            return data;
        }, (data) => {
            // We hash in here as not all cloud providers may use MD5
            var hasher = self._md5Workers.next();

            // Hash the part and return the result
            return hasher.hash(data).then((md5: string) => {
                return {
                    md5: md5,
                    part: part,
                    size_bytes: data.size
                };
            });
        });
    }

    private _resume(request = null, firstChunk = null) {
        var i: number,
            self = this;

        if (request) {
            if (request.type === 'parts') {
                // The upload has already started and we want to continue where we left off
                self._pendingParts = <Array<number>>request.part_list;
                if (request.part_data) {
                    var partId,
                        part;

                    self._memoization = request.part_data;

                    // If we are missing data we need to upload the part again
                    for (partId in self._memoization) {
                        part = self._memoization[partId];

                        if (!part.path) {
                            self._pendingParts.push(part.part);
                        }
                    }

                    // Lets sort and remove duplicate entries
                    self._pendingParts = self._pendingParts.sort().filter(function(item, pos, ary) {
                        return !pos || item !== ary[pos - 1];
                    });
                }

                for (i = 0; i < self._upload.parallel; i += 1) {
                    self._nextPart();
                }
            } else {
                self._api.update({
                    resumable_id: 'n/a',
                    file_id: firstChunk.md5,
                    part: 1
                }).subscribe((data) => {
                    // We are provided with the first request
                    self._nextPartNumber();
                    self._memoization[1].path = data.path;
                    self._setPart(data, firstChunk);

                    // Then we want to request any parallel parts
                    for (i = 1; i < self._upload.parallel; i += 1) {
                        self._nextPart();
                    }
                }, function(reason) {
                    // We should start from the beginning
                    self._restart();
                    self._defaultError(reason);
                });
            }
        } else {
            // Client side resume after the upload was paused
            for (i = 0; i < self._upload.parallel; i += 1) {
                self._nextPart();
            }
        }
    }

    private _generatePartManifest() {
        var parts:any = [],
            i: number,
            etag: any;

        for (i = 1; i < 10000; i += 1) {
            etag = this._memoization[i];

            if (etag) {
                parts.push({
                    path: etag.path,
                    etag: etag.md5,
                    size_bytes: etag.size_bytes
                });
            } else {
                break;
            }
        }

        return JSON.stringify(parts);
    }

    private _nextPart() {
        var self = this,
            partNum = self._nextPartNumber(),
            details: any;

        if ((partNum - 1) * self._partSize < self.size) {
            self._processPart(partNum).then((result) => {
                if (self.state !== State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                };

                details = self._getPartData();

                self._api.nextChunk(
                    partNum,
                    result.md5,
                    details.part_list,
                    details.part_data
                ).subscribe((response) => {
                    self._memoization[partNum].path = response.path;

                    self._setPart(response, result);
                }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
        } else {
            if (self._currentParts.length === 1 && self._currentParts[0] === partNum) {
                // This is the final commit
                self._isFinishing = true;
                self._api.sign('finish').subscribe((request) => {
                    request.data = self._generatePartManifest();

                    self._api.signedRequest(request).request
                        .then(self._completeUpload.bind(self), self._defaultError.bind(self));
                }, self._defaultError.bind(self));
            } else if (!self._isFinishing) {
                // Remove part just added to _currentParts
                // We need this logic when performing parallel uploads
                self._partComplete(partNum);

                // We should update upload progress
                // NOTE:: no need to subscribe as API does this for us
                // also this is a non-critical request.
                //
                // Also this is only executed towards the end of an upload
                // as no new parts are being requested to update the status
                details = self._getPartData();
                details.part_update = true;
                self._api.update(details);
            }
        }
    }

    private _setPart(request, partInfo) {
        var self = this,
            monitor = self._requestWithProgress(partInfo, request);

        monitor.then(() => {
            self._partComplete(partInfo.part);
            self._nextPart();
        }, self._defaultError.bind(self));
    }

    private _direct(request, partInfo) {
        var self = this,
            monitor = self._requestWithProgress(partInfo, request);

        self._isDirectUpload = true;

        monitor.then(() => {
            self._completeUpload();
        }, self._defaultError.bind(self));
    }
}
