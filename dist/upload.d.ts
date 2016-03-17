import { Http } from 'angular2/http';
import { CondoApi } from './condo-api';
import { Md5Workers } from './md5-workers';
export declare enum State {
    Paused = 0,
    Uploading = 1,
    Completed = 2,
    Aborted = 3,
}
export interface ICloudStorage {
    new (_api: CondoApi, _upload: Upload, _md5Workers: Md5Workers, _completeCB: any): CloudStorage;
    lookup: string;
}
export declare abstract class CloudStorage {
    protected _api: CondoApi;
    protected _upload: Upload;
    protected _md5Workers: Md5Workers;
    private _completeCB;
    static name: string;
    state: State;
    size: number;
    progress: number;
    protected _strategy: string;
    protected _file: any;
    protected _finalising: boolean;
    protected _pendingParts: Array<number>;
    protected _currentParts: Array<number>;
    protected _memoization: any;
    protected _isDirectUpload: boolean;
    protected _isFinishing: boolean;
    private _lastPart;
    private _progress;
    constructor(_api: CondoApi, _upload: Upload, _md5Workers: Md5Workers, _completeCB: any);
    start(): void;
    pause(): void;
    destroy(): void;
    protected abstract _start(): any;
    protected _nextPartNumber(): number;
    protected _getCurrentParts(): number[];
    protected _partComplete(number: number): void;
    protected _completeUpload(): void;
    protected _defaultError(reason: any): void;
    protected _requestWithProgress(partInfo: any, request: any): any;
    protected _updateProgress(): void;
    protected _restart(): void;
    protected _hashData(id: string, dataCb: any, hashCb: any): any;
    protected _getPartData(): {
        part_list: number[];
        part_data: any[];
    };
}
export declare class Upload {
    private _http;
    private _apiEndpoint;
    private _md5Workers;
    file: any;
    retries: number;
    parallel: number;
    static provider: any;
    complete: boolean;
    uploading: boolean;
    cancelled: boolean;
    totalBytes: number;
    progress: number;
    filename: string;
    metadata: any;
    error: string;
    promise: Promise<Upload>;
    private _initialised;
    private _resolve;
    private _reject;
    private _api;
    private _provider;
    private _retries;
    static humanReadableByteCount(bytes: number, si?: boolean): string;
    constructor(_http: Http, _apiEndpoint: string, _md5Workers: Md5Workers, file: any, retries: number, parallel: number);
    resume(parallel?: number): void;
    pause(): void;
    cancel(): void;
    isWaiting(): boolean;
    notifyError(err: any): void;
    private _initialise(residence);
}
