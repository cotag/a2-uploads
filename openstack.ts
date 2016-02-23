
import {CondoApi} from './condo-api';
import {Upload, State, CloudStorage} from './upload';


export class OpenStack extends CloudStorage {
    static lookup: string = 'OpenStackSwift';

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

    private _resume(response = null, firstChunk = null) {
        var i:number;

        if (response) {
            if (response.type === 'parts') {
                // The upload has already started and we want to continue where we left off
                this._pendingParts = <Array<number>>response.part_list;
                for (i = 0; i < this._upload.parallel; i += 1) {
                    this._nextPart();
                }
            } else {
                this._setPart(response, firstChunk);

                // upload this 
                for (i = 1; i < this._upload.parallel; i += 1) {
                    this._nextPart();
                }
            }
        } else {
            for (i = 0; i < this._upload.parallel; i += 1) {
                this._nextPart();
            }
        }
    }

    private _nextPart() {
        var self = this,
            partNum = self._nextPartNumber();

        if ((partNum - 1) * self._partSize < self.size) {
            self._processPart(partNum).then((result) => {
                if (self.state !== State.Uploading) {
                    // upload was paused or aborted as we were reading the file
                    return;
                };

                self._api.nextChunk(
                    partNum,
                    result.md5,
                    self._getCurrentParts()
                ).subscribe((response) => {
                    self._setPart(response, result);
                }, self._defaultError.bind(self));
            });
        } else if (self._currentParts.length === 0) {
            // This is the final commit
            self._api.sign('finish').subscribe((response) => {
                self._api.signedRequest(response).request
                    .then(() => {
                        self._completeUpload();
                    }, self._defaultError.bind(self));
            }, self._defaultError.bind(self));
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

        monitor.then(() => {
            self._completeUpload();
        }, self._defaultError.bind(self));
    }
}
