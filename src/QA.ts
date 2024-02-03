import * as vscode from 'vscode';
import { HC3 } from './hc3';

export class QAFile implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	
	name: string;
	data?: Uint8Array;
	permissions?: vscode.FilePermission;
	
  deviceId: number;
	fname: string;
	initialized = false;
	isMain = false;
	parent: QA;
	hc3: HC3;

	constructor(hc3: HC3, name: string, parent: QA, data: Uint8Array) {
		this.type = vscode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name+".lua";
		this.data = data;
		this.size = data.byteLength;

		this.hc3 = hc3;
		this.parent = parent;
		this.deviceId = parent.deviceId;
		this.fname = name;
	}

  async delete() {
		if (this.isMain) {
			vscode.window.showErrorMessage(`Can't delete main file`);
			throw new Error('Can\'t delete main file');
		}
		try {
			const resp = await this.hc3.callHC3("DELETE",`/quickApp/${this.deviceId}/files/${this.fname}`);
			this.parent.entries.delete(this.name);
			this.parent.size -= 1;
		} catch (err) {
			throw err;
		}
  }

  async rename(newName: string, options: { overwrite: boolean }) {
		if (this.permissions === vscode.FilePermission.Readonly) {
			throw new Error('No permissions');
		}
		const fname = this.parent.checkQAFile(newName);
		try {
			const resp = await this.hc3.callHC3("PUT",`/quickApp/${this.deviceId}/files/${this.fname}`, `{"name":"${fname}"}`);
			this.parent.entries.delete(this.name);
			this.parent.entries.set(newName, this);
		} catch (err) {
			throw err;
		}
  }

	async getContent(): Promise<Uint8Array> {
		if (!this.initialized) {
			await this.fetchFile();
		}
		return this.data!;
	}

	writeContent(content: Uint8Array) {
		this.data = content;
		return this.flushFile();
	}

	async initialize() {
    if (!this.initialized) {
      await this.fetchFile();
			this.initialized = true;
    }
	}

	private async fetchFile(): Promise<QAFile> {
		try {
			const res = await this.hc3.callHC3("GET",`/quickApp/${this.deviceId}/files/${this.fname}`);
			const file = res as any;
			this.data = Buffer.from(file.content);
			this.isMain = file.isMain;
			this.mtime = Date.now();
			this.size = this.data.byteLength;
			this.hc3.debug(`fetched QA:${this.deviceId}.file:${this.fname} content (${this.size} bytes)`);
			const uri = vscode.Uri.parse(`hc3fs:/QuickApps/${this.parent.name}/${this.name}`);
			this.hc3._fireSoon({ type: vscode.FileChangeType.Changed, uri });
			return this;
		} catch (err) {
			throw err;
		}
	}

	private async flushFile(): Promise<any> {
		const data = {
			content: this.data!.toString(),
			type: 'lua',
			name: this.fname,
			isOpen : false,
			isMain: this.isMain,
		};
		return this.hc3.callHC3("PUT",`/quickApp/${this.deviceId}/files/${this.fname}`, JSON.stringify(data));
	}

}

export class QA implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	permissions?: vscode.FilePermission;
	name: string; // file system name for FileStat
	entries = new Map<string, QAFile>();
	
	qaName: string;
  deviceId: number;
	initialized: boolean;
	hc3: HC3;

	constructor(hc3: HC3, id: number = 0, name: string) {
		this.type = vscode.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = `${id} ${name}`;

		this.hc3 = hc3;
		this.qaName = name;
		this.deviceId = id;
		this.initialized = false;
	}

  delete() {
    vscode.window.showErrorMessage(`Not supported: create QA directory`);
		throw new Error('Not supported: create QA directory');
  }

  rename(newName: string, options: { overwrite: boolean }) {
    vscode.window.showErrorMessage(`Not supported: rename QA directory`);
		throw new Error('Not supported: rename QA directory');
  }

	private async createFile(name: string, content: Uint8Array): Promise<any>  {
		const data = {
			content: content.toString(),
			type: 'lua',
			name: name,
			isOpen : false,
			isMain: false,
		};
		const d = JSON.stringify(data);
		const resp = await this.hc3.callHC3("POST",`/quickApp/${this.deviceId}/files`, d);
		return await resp.json();
	}

	checkQAFile(name: string): string {
		if (!name.endsWith('.lua')) {
			throw new Error('Only .lua files can be created');
		}
		const fname = name.slice(0,-4);
		if (fname.length < 3) {
			throw new Error('File name too short (>2)');
		}
		if (fname.match(/[^a-zA-Z0-9_]/)) {
			throw new Error('File name must be alphanumeric');
		}
		if (this.entries.has(fname)) {
			throw new Error('File already exists');
		}
		return fname;
	}

	createLeaf(name: string): any {
		const fname = this.checkQAFile(name);

		const resp = this.createFile(fname,Buffer.from(""));
		const qaFile = new QAFile(this.hc3,fname,this,Buffer.from(""));
		qaFile.initialized = true;
		this.entries.set(qaFile.name, qaFile);
		this.size += 1;
		return qaFile;
  }

	async initialize(): Promise<void> {
    if (!this.initialized) {
      const _ = await this.fetchFiles();
			this.initialized = true;
    }
		return;
	}

	private async fetchFiles(): Promise<QA> {
		try {
			const res = await this.hc3.callHC3("GET",`/quickApp/${this.deviceId}/files`);
			const data = res as Array<any>;
			for (const file of data) {
				const qaFile = new QAFile(this.hc3,file.name,this,Buffer.from(""));
				this.entries.set(qaFile.name, qaFile);
			}
			return this;
		} catch (err) {
				throw err;
		}
	}

	async saveToFile(fsPath: string) {
		const data:any = await this.hc3.callHC3("GET",`/quickApp/export/${this.deviceId}`);
		vscode.workspace.fs.writeFile(vscode.Uri.file(fsPath),Buffer.from(JSON.stringify(data,null,2)));
	}
}

export class QADir implements vscode.FileStat {
	type = vscode.FileType.Directory;
	ctime = Date.now();
	mtime = Date.now();
	size = 0;
	permissions?: vscode.FilePermission;
	name: string;
	entries = new Map<string, QA>();

	hc3: HC3; 
	initialized = false;

	constructor(hc3: HC3) {
		this.name = "QuickApps";
		this.hc3 = hc3;
		this.permissions = vscode.FilePermission.Readonly;
	}

	delete() {
    vscode.window.showErrorMessage(`Not supported: delete QA directory`);
		throw new Error('Not supported: delete QA directory');
	}

	rename(newName: string, options: { overwrite: boolean }) {
    vscode.window.showErrorMessage(`Not supported: rename QA directory`);
		throw new Error('Not supported: rename QA directory');
	}

	async refresh() {
		try {
			const resp = await this.hc3.callHC3("GET",'/devices?interface=quickApp');
			const data = resp as Array<any>;
			for (const device of data) {
				const qa = new QA(this.hc3,device.id, device.name);
				const qaFile = new QAFile(this.hc3,'.rsrc.json',qa,Buffer.from(JSON.stringify(device,null,2)));
				qa.entries.set('.rsrc.json', qaFile);
				qaFile.name = '.rsrc.json'; // hack, normal files add .lua...
				qaFile.initialized = true;
				qaFile.permissions = vscode.FilePermission.Readonly;
				this.entries.set(qa.name, qa);
			}
			this.hc3.initialized();
		} catch(err) {
			vscode.window.showErrorMessage(`${err}`);
			throw err;
		}
	}

	async initialize() {
    if (!this.initialized) {
			this.initialized = true;
      await this.refresh();
    }
	}

	createLeaf(name: string): any {
    throw new Error("QA's can't be created");
  }

}