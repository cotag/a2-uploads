import { ParallelHasher } from 'ts-md5/dist/parallel_hasher';
export declare const MD5_WORKER_BASE: string;
export declare class Md5Workers {
    private _workers;
    private _workerCount;
    private _next;
    constructor(workerBase: string);
    next(): ParallelHasher;
}
