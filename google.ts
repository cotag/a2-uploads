
import {CondoApi} from './condo-api';
import {Upload, State, CloudStorage} from './upload';


export class Google extends CloudStorage {
    static lookup: string = 'GoogleCloudStorage';


    constructor(api: CondoApi, upload: Upload, completeCB: any) {
        super(api, upload, completeCB);
    }


    protected _start() {
        var self = this;

        if (self._strategy === undefined || self.state === State.Paused) {
            self.state = State.Uploading;

            // Prevents this function being called twice
            self._strategy = null;

            self._processPart(self._file).then((result) => {
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
        }
    }


    // Calculates the MD5 of the part of the file we are uploading
    private _processPart(chunk: Blob, part: number = 0) {
        var self = this;

        return self._hashData(part.toString(), () => {
            return chunk;
        }, (data) => {
            // We hash in here as not all cloud providers may use MD5
            var hasher = CondoApi.nextHasher();

            // Hash the part and return the result
            return hasher.hash(data).then((md5: string) => {
                return {
                    md5: window.btoa(CondoApi.hexToBin(md5)),
                    part: part
                };
            });
        });
    }

    private _resume(request, firstChunk) {
        var self = this;

        self._api.signedRequest(request).request
            .then((xhr) => {
                if (request.type === 'status') {
                    if (xhr.status === request.expected) {
                        // We need to resume the upload
                        var rangeStart: number = parseInt(xhr.getResponseHeader('Range').split('-')[1], 10) + 1;
                        self._processPart(self._file.slice(rangeStart), rangeStart).then((partInfo) => {
                            if (self.state !== State.Uploading) {
                                // upload was paused or aborted as we were reading the file
                                return;
                            }

                            self._api.sign(rangeStart, partInfo.md5).
                                subscribe((data) => {
                                    self._performUpload(data, partInfo, rangeStart);
                                }, self._defaultError.bind(self));
                        }, self._defaultError.bind(self));
                    } else {
                        // The upload is complete
                        self._completeUpload();
                    }
                } else {
                    // We've created the upload - we need to inform our server
                    self._api.update({
                        // grab the upload_id from the Location header
                        resumable_id: self._getQueryParams(xhr.getResponseHeader('Location').split('?')[1]).upload_id,
                        file_id: firstChunk.md5,
                        part: 0
                    }).subscribe((data) => {
                        self._performUpload(data, firstChunk, 0);
                    }, function(reason) {
                        // We should start from the beginning
                        self._restart();
                        self._defaultError(reason);
                    });
                }
            }, self._defaultError.bind(self));
    }


    private _performUpload(request, partInfo, rangeStart) {
        var self = this,
            monitor = self._requestWithProgress(partInfo, request);

        monitor.then(() => {
            self._completeUpload();
        }, self._defaultError.bind(self));
    }


    private _direct(request, partInfo) {
        var self = this,
            monitor = self._requestWithProgress(partInfo, request);

        monitor.then(() => {
            self._completeUpload();
        }, self._defaultError.bind(self));
    }


    private _getQueryParams(qs) {
        qs = qs.split('+').join(' ');

        var params: any = {},
            tokens,
            re = /[?&]?([^=]+)=([^&]*)/g;

        // NOTE:: assignment in while loop is deliberate
        while (tokens = re.exec(qs)) {
            params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
        }

        return params;
    }
}
