// Angular2 imports
import { Injectable } from '@angular/core';
import { Http } from '@angular/http';

// Manager imports
import { ICloudStorage } from './cloud-storage';
import { CondoApi } from './condo-api';
import { Md5Workers } from './md5-workers';
import { LIB_UTILS } from './settings';
import { Upload } from './upload';

@Injectable()
export class UploadManager {

    public static addProvider(provider: ICloudStorage) {
        Upload.provider[provider.lookup] = provider;
        LIB_UTILS.log('Manager', `Added provider '${provider.lookup}'`);
    }

    public uploads: Upload[] = [];

    public autoStart: boolean = true;
    public autoRemove: boolean = false;
    public removeAfter: number = 0;
    public simultaneous: number = 2;    // Uploads
    public parallel: number = 3;        // Parallel parts of an upload
    public retries: number = 4;         // Number of times a failed part can occur for an upload

    public metadata: any;               // Additional data to be provided with the upload

    private _apiEndpoint: string;
    private _token: string = '';

    constructor(private _http: Http,
                private _md5Workers: Md5Workers) {
    }

    set endpoint(url: string) {
        this._apiEndpoint = url;
    }

    set token(token: string) {
        CondoApi.token = token;
    }

    set worker_base(url: string) {
        this._md5Workers.setup(url);
    }

    public upload(files: Blob[], params?: any) {
        if (!this._apiEndpoint) {
            LIB_UTILS.error('Manager', 'No set endpoint.');
            return;
        }
        let autostart = this.autoStart;
        const completeCallback = this._uploadComplete.bind(this);

        files.forEach((file) => {
            const upload: Upload = new Upload(this._http, this._apiEndpoint, this._md5Workers, file, this.retries, this.parallel, params);
            this.uploads.push(upload);

            // Apply metadata
            upload.metadata = this.metadata;

            // watch for completion
            upload.promise.then(completeCallback, completeCallback);

            // Only autostart if we under our simultaneous limit
            if (autostart) {
                autostart = this._checkAutostart();
                if (autostart) {
                    upload.resume(this.parallel);
                }
            }
        });
    }

    public pauseAll() {
        this.uploads.forEach((upload) => {
            upload.pause();
        });
    }

    public resumeUpload(upload) {
        upload.resume(this.parallel);
    }

    public resumeAll() {
        this.uploads.forEach((upload) => {
            upload.resume(this.parallel);
        });
    }

    public updateMetadata(metadata: any) {
        this.metadata = metadata;

        this.uploads.forEach((upload) => {
            upload.metadata = metadata;
        });
    }

    public remove(upload: Upload) {
        const index: number = this.uploads.indexOf(upload);
        upload.cancel();

        if (index !== -1) {
            this.uploads.splice(index, 1);
        }
    }

    public removeAll() {
        this.uploads.forEach((upload) => {
            upload.cancel();
        });

        this.uploads = [];
    }

    public removeComplete() {
        const complete: Upload[] = [];
        const uploads = this.uploads;

        uploads.forEach((upload) => {
            if (upload.complete) {
                complete.push(upload);
            }
        });

        complete.forEach((upload) => {
            const index: number = uploads.indexOf(upload);
            uploads.splice(index, 1);
        });
    }

    private _checkAutostart() {
        let uploading: number = 0;
        const length: number = this.uploads.length;
        let index: number = 0;

        for (; index < length; index += 1) {
            if (this.uploads[index].uploading) {
                uploading += 1;

                if (uploading >= this.simultaneous) {
                    return false;
                }
            }
        }

        return true;
    }

    private _uploadComplete(upload) {
        let index: number;

        if (this.autoRemove) {
            if (this.removeAfter) {
                setTimeout(() => {
                    this.remove(upload);
                }, this.removeAfter);
            } else {
                this.remove(upload);
            }
        }

        if (this.autoStart && this.uploads.length > 0 && this._checkAutostart()) {
            for (index = 0; index < this.uploads.length; index += 1) {
                if (this.uploads[index].isWaiting()) {
                    this.uploads[index].resume(this.parallel);
                    break;
                }
            }
        }
    }
}
