
import { CloudStorage, State } from './cloud-storage';
import { CondoApi } from './condo-api';
import { Md5Workers } from './md5-workers';
import { Upload } from './upload';

export class OpenStack extends CloudStorage {
    public static lookup: string = 'OpenStackSwift';

    // 2MB part size
    private _partSize: number = 2097152;


    constructor(api: CondoApi, upload: Upload, workers: Md5Workers, completeCB: any) {
        super(api, upload, workers, completeCB);
    }


    protected _start() {
        if (this._strategy === undefined) {
            this.state = State.Uploading;

            // Prevents this function being called twice
            this._strategy = null;

            // Update part size
            // Openstack has a limit of 1000 parts for a static large file
            if ((this._partSize * 1000) < this.size) {
                this._partSize = Math.floor(this.size / 1000);

                // 5GB limit on part sizes (this is a limit on openstack)
                if (this._partSize > (5 * 1024 * 1024 * 1024)) {
                    this._upload.cancel();
                    this._defaultError('file exceeds maximum size');
                    return;
                }
            }

            this._processPart(1).then((result) => {
                if (this.state !== State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                }

                this._api.create({ file_id: result.md5 })
                    .subscribe((response) => {
                        this._strategy = response.type;
                        if (response.type === 'direct_upload') {
                            this._direct(response, result);
                        } else {
                            this._resume(response, result);
                        }
                    }, this._defaultError.bind(this));
            }, this._defaultError.bind(this));
        } else if (this.state === State.Paused) {
            this._resume();
        }
    }


    // Calculates the MD5 of the part of the file we are uploading
    private _processPart(part: number) {
        return this._hashData(part.toString(), () => {
            let data: any;
            let endbyte: number;

            // Calculate the part of the file that requires hashing
            if (this.size > this._partSize) {
                endbyte = part * this._partSize;
                if (endbyte > this.size) {
                    endbyte = this.size;
                }
                data = this._file.slice((part - 1) * this._partSize, endbyte);
            } else {
                data = this._file;
            }

            return data;
        }, (data) => {
            // We hash in here as not all cloud providers may use MD5
            const hasher = this._md5Workers.next();

            // Hash the part and return the result
            return hasher.hash(data).then((md5: string) => {
                return {
                    md5,
                    part,
                    size_bytes: data.size,
                };
            });
        });
    }

    private _resume(request = null, firstChunk = null) {
        let i: number;

        if (request) {
            if (request.type === 'parts') {
                // The upload has already started and we want to continue where we left off
                this._pendingParts = request.part_list as number[];
                if (request.part_data) {
                    let part: any;

                    this._memoization = request.part_data;

                    // If we are missing data we need to upload the part again
                    for (const partId in this._memoization) {
                        if (this._memoization.hasOwnProperty(partId)) {
                            part = this._memoization[partId];

                            if (!part.path) {
                                this._pendingParts.push(part.part);
                            }
                        }
                    }

                    // Lets sort and remove duplicate entries
                    this._pendingParts = this._pendingParts.sort().filter((item, pos, ary) => {
                        return !pos || item !== ary[pos - 1];
                    });
                }

                for (i = 0; i < this._upload.parallel; i += 1) {
                    this._nextPart();
                }
            } else {
                this._api.update({
                    resumable_id: 'n/a',
                    file_id: firstChunk.md5,
                    part: 1,
                }).subscribe((data) => {
                    // We are provided with the first request
                    this._nextPartNumber();
                    this._memoization[1].path = data.path;
                    this._setPart(data, firstChunk);

                    // Then we want to request any parallel parts
                    for (i = 1; i < this._upload.parallel; i += 1) {
                        this._nextPart();
                    }
                }, function(reason) {
                    // We should start from the beginning
                    this._restart();
                    this._defaultError(reason);
                });
            }
        } else {
            // Client side resume after the upload was paused
            for (i = 0; i < this._upload.parallel; i += 1) {
                this._nextPart();
            }
        }
    }

    private _generatePartManifest() {
        const parts: any = [];
        let etag: any;

        for (let i = 1; i < 10000; i += 1) {
            etag = this._memoization[i];

            if (etag) {
                parts.push({
                    path: etag.path,
                    etag: etag.md5,
                    size_bytes: etag.size_bytes,
                });
            } else {
                break;
            }
        }

        return JSON.stringify(parts);
    }

    private _nextPart() {
        const partNum = this._nextPartNumber();
        let details: any;

        if ((partNum - 1) * this._partSize < this.size) {
            this._processPart(partNum).then((result) => {
                if (this.state !== State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                }

                details = this._getPartData();

                this._api.nextChunk(
                    partNum,
                    result.md5,
                    details.part_list,
                    details.part_data,
                ).subscribe((response) => {
                    this._memoization[partNum].path = response.path;

                    this._setPart(response, result);
                }, this._defaultError.bind(this));
            }, this._defaultError.bind(this));
        } else {
            if (this._currentParts.length === 1 && this._currentParts[0] === partNum) {
                // This is the final commit
                this._isFinishing = true;
                this._api.sign('finish').subscribe((request) => {
                    // This might occur on the server.
                    // So we need to check the response
                    if (request.signature) {
                        request.data = this._generatePartManifest();
                        this._api.signedRequest(request).request
                            .then(this._completeUpload.bind(this), this._defaultError.bind(this));
                    } else {
                        this._completeUpload();
                    }
                }, this._defaultError.bind(this));
            } else if (!this._isFinishing) {
                // Remove part just added to _currentParts
                // We need this logic when performing parallel uploads
                this._partComplete(partNum);

                // We should update upload progress
                // NOTE:: no need to subscribe as API does this for us
                // also this is a non-critical request.
                //
                // Also this is only executed towards the end of an upload
                // as no new parts are being requested to update the status
                details = this._getPartData();
                details.part_update = true;
                this._api.update(details);
            }
        }
    }

    private _setPart(request, partInfo) {
        const monitor = this._requestWithProgress(partInfo, request);

        monitor.then(() => {
            this._partComplete(partInfo.part);
            this._nextPart();
        }, this._defaultError.bind(this));
    }

    private _direct(request, partInfo) {
        const monitor = this._requestWithProgress(partInfo, request);

        this._isDirectUpload = true;

        monitor.then(() => {
            this._completeUpload();
        }, this._defaultError.bind(this));
    }
}
