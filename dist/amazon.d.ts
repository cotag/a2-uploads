import { CondoApi } from './condo-api';
import { Upload, CloudStorage } from './upload';
import { Md5Workers } from './md5-workers';
export declare class Amazon extends CloudStorage {
    static lookup: string;
    private _partSize;
    constructor(api: CondoApi, upload: Upload, workers: Md5Workers, completeCB: any);
    protected _start(): void;
    private _processPart(part);
    private _resume(request?, firstChunk?);
    private _generatePartManifest();
    private _nextPart();
    private _setPart(request, partInfo);
    private _direct(request, partInfo);
}
