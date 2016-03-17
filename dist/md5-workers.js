"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var core_1 = require('angular2/core');
var parallel_hasher_1 = require('ts-md5/dist/parallel_hasher');
// This allows the href of the MD5 worker to be configurable
exports.MD5_WORKER_BASE = '/node_modules/ts-md5/dist/md5_worker.js';
var Md5Workers = (function () {
    function Md5Workers(workerBase) {
        this._workers = [];
        this._workerCount = 3;
        this._next = -1;
        var i;
        for (i = 0; i < this._workerCount; i += 1) {
            this._workers.push(new parallel_hasher_1.ParallelHasher(workerBase));
        }
    }
    Md5Workers.prototype.next = function () {
        this._next += 1;
        if (this._next >= this._workerCount) {
            this._next = 0;
        }
        return this._workers[this._next];
    };
    Md5Workers = __decorate([
        __param(0, core_1.Inject(exports.MD5_WORKER_BASE)), 
        __metadata('design:paramtypes', [String])
    ], Md5Workers);
    return Md5Workers;
}());
exports.Md5Workers = Md5Workers;
//# sourceMappingURL=md5-workers.js.map