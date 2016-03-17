import { Http } from 'angular2/http';
import { ICloudStorage, Upload } from './upload';
import { Md5Workers } from './md5-workers';
export declare class UploadManager {
    private _http;
    private _apiEndpoint;
    private _md5Workers;
    uploads: Array<Upload>;
    autoStart: boolean;
    autoRemove: boolean;
    removeAfter: number;
    simultaneous: number;
    parallel: number;
    retries: number;
    metadata: any;
    static addProvider(provider: ICloudStorage): void;
    constructor(_http: Http, _apiEndpoint: string, _md5Workers: Md5Workers);
    upload(files: Array<Blob>): void;
    pauseAll(): void;
    resumeUpload(upload: any): void;
    resumeAll(): void;
    updateMetadata(metadata: any): void;
    remove(upload: Upload): void;
    removeAll(): void;
    removeComplete(): void;
    private _checkAutostart();
    private _uploadComplete(upload);
}
