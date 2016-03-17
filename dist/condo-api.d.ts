import { Http } from 'angular2/http';
import { Upload } from './upload';
export declare class CondoApi {
    private _http;
    private _apiEndpoint;
    private _upload;
    uploadId: string;
    private _params;
    private _uploadId;
    private _currentRequests;
    static hexToBin(input: string): string;
    constructor(_http: Http, _apiEndpoint: string, _upload: Upload);
    init(): any;
    create(options?: any): any;
    nextChunk(partNum: number, partId: string, parts: Array<number>, partData?: any): any;
    sign(part_number: any, part_id?: string): any;
    update(params?: any): any;
    abort(): void;
    destroy(): void;
    signedRequest(opts: any, monitor?: boolean): any;
    private _monitorRequest(self, req);
    private _setParams(search, params);
}
