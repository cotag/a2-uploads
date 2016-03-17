import { CondoApi } from './condo-api';
import { Upload, CloudStorage } from './upload';
import { Md5Workers } from './md5-workers';
export declare class Google extends CloudStorage {
    static lookup: string;
    constructor(api: CondoApi, upload: Upload, workers: Md5Workers, completeCB: any);
    protected _start(): void;
    private _processPart(chunk, part?);
    private _resume(request, firstChunk);
    private _performUpload(request, partInfo, rangeStart);
    private _direct(request, partInfo);
    private _getQueryParams(qs);
}
