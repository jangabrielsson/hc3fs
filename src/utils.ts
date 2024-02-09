import * as vscode from 'vscode';
import * as fs from 'fs/promises';

const O_HC3Console = vscode.window.createOutputChannel("HC3 console",{log: true});
const O_HC3Events = vscode.window.createOutputChannel("HC3 events",{log: true});
export const O_HC3fslog = vscode.window.createOutputChannel("HC3 fslog",{log: true});

export const logConsole = (time: string, typ:string, tag:string, message:string): void => {
	if (typ==='debug') {
		O_HC3Console.debug(`[${tag}] ${message}`);
	} else if (typ==='warning') {
		O_HC3Console.warn(`[${tag}] ${message}`);
	} else if (typ==='trace') {
		O_HC3Console.trace(`[${tag}] ${message}`);
	} else if (typ==='error') {
		O_HC3Console.error(`[${tag}] ${message}`);
	}
};

export const logEvents = (content: string, reveal = false): void => {
	O_HC3Events.debug(content);
	if (reveal) {
		O_HC3Events.show(true);
	}
};

export const logfs = (content: string, reveal = false): void => {
	O_HC3fslog.debug(content);
	console.log(content);
	if (reveal) {
		O_HC3fslog.show(true);
	}
};

export async function fileExist(path: string): Promise<boolean> {
  return fs.stat(path).then(_ => {
    return true;
  }).catch(err => {
    return false;
  });
}

export class Gate {
	flag: boolean = false;
	resolve?: () => void;
	promise: Promise<void> = new Promise<void>((resolve, reject) => this.resolve = resolve);
	
	async lock(): Promise<void> {
		if (this.flag) {
			return this.promise;
		} else {
			this.flag = true;
			this.promise = new Promise<void>((resolve, reject) => this.resolve = resolve);
			return Promise.resolve();
		}
	}

	async unlock(): Promise<void> {
		this.flag = false;
		this.resolve!();
	}

	open() {
		this.flag = true;
		this.resolve!();
	}
	
	async waitForGate(): Promise<void> {
		if (this.flag) {
			return Promise.resolve();
		}
		return this.promise;
	}
}

export class Lock {
	flag: boolean = false;
	resolve?: () => void;
	promise?: Promise<void>;
	async aquire(fn: () => Promise<void>): Promise<void> {
		while (this.flag) {
			await this.promise;
		}
		this.flag = true;
		this.promise = new Promise<void>((resolve, reject) => this.resolve = resolve);
		try {
			await fn();
		} finally {
			this.flag = false;
			this.resolve!();
		}
	}
}

export class StringBuffer {
	buffer: string[] = [];
	add(str: string) {
		this.buffer.push(str);
	}
	toString(): string {
		return this.buffer.join('');
	}
}
