
import { Inject, Injectable } from '@angular/core';
import { ParallelHasher } from 'ts-md5/dist/parallel_hasher';


// This allows the href of the MD5 worker to be configurable
export const MD5_WORKER_BASE: string = '/node_modules/ts-md5/dist/md5_worker.js';

@Injectable()
export class Md5Workers {
    private _workers: ParallelHasher[] = [];
    private _workerCount: number = 3;
    private _next: number = -1;

    constructor() {
        this.setup();
    }

    public setup(base: string = MD5_WORKER_BASE) {
        if (this._workers && this._workers.length > 0) {
            for (const worker of this._workers) {
                worker.terminate();
            }
        }
        this._workers = [];
        for (let i = 0; i < this._workerCount; i += 1) {
            this._workers.push(new ParallelHasher(base));
        }
    }

    public next() {
        this._next += 1;
        if (this._next >= this._workerCount) {
            this._next = 0;
        }

        return this._workers[this._next];
    }
}
