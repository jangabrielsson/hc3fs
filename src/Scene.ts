import * as vscode from 'vscode';
import { HC3 } from './hc3';

export class SceneFile implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	
	name: string;
	data?: Uint8Array;
	permissions?: vscode.FilePermission;
	
  sceneId: number;
	initialized = false;  

	constructor(sceneId: number, name: string) {
		this.type = vscode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;

		this.sceneId = sceneId;
	}

  async initialize() {
    if (!this.initialized) {
      this.initialized = true;
    }
	}

  delete() {
    console.log('delete');
  }

  rename(newName: string, options: { overwrite: boolean }) {
    console.log('rename');
  }

  getContent(): Uint8Array {
		return this.data!;
	}

  writeContent(content: Uint8Array) {
		this.data = content;
	}

	toggleReadOnly() {
		if (this.permissions === vscode.FilePermission.Readonly) {
			this.permissions = undefined;
		} else {
			this.permissions = vscode.FilePermission.Readonly;
		}
	}
}

export class Scene implements vscode.FileStat {
	
	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;
	permissions?: vscode.FilePermission;
	name: string; // file system name for FileStat
	entries = new Map<string, SceneFile>();
	
  sceneId: number;
	initialized = false;
  sname: string;
  data: any;
  hc3: HC3;

	constructor(hc3: HC3, data: any) {
		this.type = vscode.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
    this.name = `${data.id}_${data.name}`; // Creating files with spaces in them can cause trouble...

    this.hc3 = hc3;
		this.sceneId = data.id;
    this.sname = data.name;
    this.data = data;

    this.permissions = vscode.FilePermission.Readonly;
    this.createFile('.rsrc.json',JSON.stringify(data,null,2));
    if (data.type === "lua" || data.type === "scenario") {
      const cont = JSON.parse(data.content);
      this.createFile('conditions.lua',cont.conditions);
      this.createFile('actions.lua',cont.actions);
    } else if (data.type === "json") {
      const cont = JSON.parse(data.content);
      this.createFile('block.json',JSON.stringify(cont,null,2));
    } 
	}

  private createFile(name: string, content: string): any {
    let scf = new SceneFile(this.sceneId, name);
    scf.writeContent(Buffer.from(content));
    scf.permissions = vscode.FilePermission.Readonly;
    this.entries.set(scf.name, scf);
  }

  async initialize() {
    if (!this.initialized) {
      this.initialized = true;
    }
	}

  delete() {
    console.log('delete');
  }

  rename(newName: string, options: { overwrite: boolean }) {
    console.log('rename');
  }

  createLeaf(name: string): any {
    throw new Error('Method not implemented.');
  }

  saveToFile(fsPath: string) {
    vscode.workspace.fs.writeFile(vscode.Uri.file(fsPath),Buffer.from(JSON.stringify(this.data,null,2)));
  }
}

export class SceneDir implements vscode.FileStat {
	type = vscode.FileType.Directory;
	ctime = Date.now();
	mtime = Date.now();
	size = 0;
	permissions?: vscode.FilePermission;
	name: string;
	entries = new Map<string, Scene>();

	hc3: HC3; 
  initialized = false;
	
	constructor(hc3: HC3) {
		this.name = "Scenes";
		this.hc3 = hc3;
		this.permissions = vscode.FilePermission.Readonly;
	}

	async initialize() {
    if (!this.initialized) {
			this.initialized = true;
      await this.refresh();
    }
	}

  createLeaf(name: string): any {
    throw new Error('Method not implemented.');
  }

  async refresh() {
    try {
			const resp = await this.hc3.callHC3("GET",'/scenes');
			const data = resp as Array<any>;
			for (const scene of data) {
				const sc = new Scene(this.hc3, scene);
				this.entries.set(sc.name, sc);
			}
			this.hc3.initialized();
		} catch(err) {
			vscode.window.showErrorMessage(`${err}`);
			throw err;
		}
  }

	async resync() {
		this.entries.clear();
		await this.refresh();
	}
}