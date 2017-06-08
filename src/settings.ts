/*
 * @Author: Alex Sorafumo
 * @Date:   2017-03-08 11:23:08
 * @Last Modified by:   Alex Sorafumo
 * @Last Modified time: 2017-05-12 12:12:29
 */

import { Observable } from 'rxjs/Observable';

export class LIB_UTILS {

    public static get(name: string) {
        return this.data[name];
    }

    public static observe(var_name: string) {
        if (!LIB_UTILS.obs[var_name]) {
            LIB_UTILS.obs[var_name] = new Observable((observer) => {
                LIB_UTILS._obs[var_name] = observer;
                setTimeout(() => {
                    LIB_UTILS._obs[var_name].next(LIB_UTILS.data[var_name]);
                }, 200);
            });
        }
        return LIB_UTILS.obs[var_name];
    }

    public static loadSettings() {
        const globalScope = self as any;
        if (globalScope) {
            for (const i of LIB_UTILS.var_list) {
                if (globalScope[i] !== undefined && (LIB_UTILS.data[i] === undefined
                    || globalScope[i] !== LIB_UTILS.data[i])) {

                    LIB_UTILS.data[i] = globalScope[i];
                    if (!LIB_UTILS.obs[i] || !LIB_UTILS._obs[i]) {
                        LIB_UTILS.obs[i] = new Observable((observer) => {
                            LIB_UTILS._obs[i] = observer;
                            LIB_UTILS._obs[i].next(LIB_UTILS.data[i]);
                        });
                    } else if (LIB_UTILS._obs[i]) {
                        LIB_UTILS._obs[i].next(LIB_UTILS.data[i]);
                    }

                }
            }
        }
    }

    public static log(type: string, msg: string, args?: any, out: string = 'debug', color?: string) {
        if (LIB_UTILS.data && LIB_UTILS.data.debug) {
            const clr = color ? color : '#009688';
            const COLOURS = ['color: #673ab7', `color:${clr}`, 'color:rgba(0,0,0,0.87)'];
            if (args) {
                console[out](`%c[UPLOADS]%c[${type}] %c${msg}`, ...COLOURS, args);
            } else {
                console[out](`%c[UPLOADS]%c[${type}] %c${msg}`, ...COLOURS);
            }
        }
    }

    public static error(type: string, msg: string, args?: any) {
        LIB_UTILS.log(type, msg, args, 'error');
    }

    public static version(version: string, build: string, out: any = 'debug') {
        const COLOURS = ['color: #f44336', 'color:#9c27b0', 'color:rgba(0,0,0,0.87)'];
        console[out](`%c[ACA]%c[LIBRARY] %cUploads - Version: ${version} | Build: ${build}`, ...COLOURS);
    }

    private static var_list: string[] = ['debug'];
    private static data: any = {};
    private static obs: any = {};
    private static _obs: any = {};
}

setTimeout(() => {
    LIB_UTILS.loadSettings();
    setInterval(() => {
        LIB_UTILS.loadSettings();
    }, 500);
}, 100);
