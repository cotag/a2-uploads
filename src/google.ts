
import { CloudStorage, State } from './cloud-storage';
import { CondoApi } from './condo-api';
import { Md5Workers } from './md5-workers';
import { Upload } from './upload';


export class Google extends CloudStorage {
    public static lookup: string = 'GoogleCloudStorage';

    constructor(api: CondoApi, upload: Upload, workers: Md5Workers, completeCB: any) {
        super(api, upload, workers, completeCB);
    }

    protected _start() {
        if (this._strategy === undefined || this.state === State.Paused) {
            this.state = State.Uploading;

            // Prevents this function being called twice
            this._strategy = null;

            this._processPart(this._file).then((result) => {
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
        }
    }


    // Calculates the MD5 of the part of the file we are uploading
    private _processPart(chunk: Blob, part: number = 0) {
        return this._hashData(part.toString(), () => {
            return chunk;
        }, (data) => {
            // We hash in here as not all cloud providers may use MD5
            const hasher = this._md5Workers.next();

            // Hash the part and return the result
            return hasher.hash(data).then((md5: string) => {
                return {
                    md5: window.btoa(CondoApi.hexToBin(md5)),
                    part
                };
            });
        });
    }

    private _resume(request, firstChunk) {
        this._api.signedRequest(request).request
            .then((xhr) => {
                if (request.type === 'status') {
                    if (xhr.status === request.expected) {
                        // We need to resume the upload
                        const rangeStart: number = parseInt(xhr.getResponseHeader('Range').split('-')[1], 10) + 1;
                        this._processPart(this._file.slice(rangeStart), rangeStart).then((partInfo) => {
                            if (this.state !== State.Uploading) {
                                // upload was paused or aborted as we were reading the file
                                return;
                            }

                            this._api.sign(rangeStart, partInfo.md5).
                                subscribe((data) => {
                                    this._performUpload(data, partInfo, rangeStart);
                                }, this._defaultError.bind(this));
                        }, this._defaultError.bind(this));
                    } else {
                        // The upload is complete
                        this._completeUpload();
                    }
                } else {
                    // We've created the upload - we need to inform our server
                    this._api.update({
                        // grab the upload_id from the Location header
                        resumable_id: this._getQueryParams(xhr.getResponseHeader('Location').split('?')[1]).upload_id,
                        file_id: firstChunk.md5,
                        part: 0
                    }).subscribe((data) => {
                        this._performUpload(data, firstChunk, 0);
                    }, function(reason) {
                        // We should start from the beginning
                        this._restart();
                        this._defaultError(reason);
                    });
                }
            }, this._defaultError.bind(this));
    }


    private _performUpload(request, partInfo, rangeStart) {
        const monitor = this._requestWithProgress(partInfo, request);

        monitor.then(() => {
            this._completeUpload();
        }, this._defaultError.bind(this));
    }


    private _direct(request, partInfo) {
        const monitor = this._requestWithProgress(partInfo, request);

        this._isDirectUpload = true;

        monitor.then(() => {
            this._completeUpload();
        }, this._defaultError.bind(this));
    }


    private _getQueryParams(qs) {
        qs = qs.split('+').join(' ');

        const params: any = {};
        let tokens: any;
        const re = /[?&]?([^=]+)=([^&]*)/g;

        // NOTE:: assignment in while loop is deliberate
        while (tokens = re.exec(qs)) {
            params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
        }

        return params;
    }
}
