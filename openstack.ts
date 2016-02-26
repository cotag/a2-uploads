
import {CondoApi} from './condo-api';
import {Upload, State, CloudStorage} from './upload';


export class OpenStack extends CloudStorage {
    static lookup: string = 'RackspaceCloudFiles';

    // 2MB part size
    private _partSize: number = 2097152;


    constructor(api: CondoApi, upload: Upload, completeCB: any) {
        super(api, upload, completeCB);
    }


    protected _start() {
        var self = this;

        if (self._strategy === undefined) {
            self.state = State.Uploading;

            // Prevents this function being called twice
            self._strategy = null;

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
            var hasher = CondoApi.nextHasher();

            // Hash the part and return the result
            return hasher.hash(data).then((md5: string) => {
                return {
                    md5: md5,
                    part: part
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
                    self._memoization = request.part_data;
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
                    self._setPart(response, result);
                }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
        } else {
            if (self._currentParts.length === 1 && self._currentParts[0] === partNum) {
                // This is the final commit
                // OpenStack won't allow the user to perform the final commit using a signed URL
                self._api.sign('finish').subscribe(self._completeUpload.bind(self), self._defaultError.bind(self));
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
                self._api.update({
                    part_list: self._getCurrentParts(),
                    part_update: true
                });
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
