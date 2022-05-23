"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Base {
    constructor(setup) {
        this.client = setup.client;
        this.ipc = setup.ipc;
        this.clusterID = setup.clusterID;
    }
    init() {
        throw new Error("Extended base class must include init method");
    }
}
exports.default = Base;
