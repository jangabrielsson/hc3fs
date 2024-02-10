import * as vscode from 'vscode';
import { StringBuffer } from './utils';
import { HC3 } from './hc3';
import { fileExist, logfs } from './utils';

type PathResolveFn = (path:string,read:boolean) => Promise<void>;

export interface Resolver {
	resolve: PathResolveFn;
	decorate: (path:string) => Promise<vscode.FileDecoration | undefined> ;
}

class QuickAppsResolver implements Resolver { // QuickApp -> populates QuickAppDir
	initialised = false;
	hc3: HC3;
	constructor(hc3: HC3) {
		this.hc3 = hc3;
	}
	async resolve(path:string,read:boolean): Promise<void> {
		if (this.initialised) { return; }
		logfs(`QuickAppsResolver: started ${path}`);
		const qas = await this.hc3.api.getQAs();
		for (const [name, value] of qas.entries()) {
			let dpath = `${path}/${value.id} ${name}`;
			dpath = dpath.replace(/ /g, '_');
			await this.hc3.createDir(dpath);
		}
		logfs(`QuickAppsResolver: resolved ${path}`);
		this.initialised = true;
	}

	async decorate(path:string): Promise<vscode.FileDecoration | undefined> {
		return;
	}
}

const FILEMARK = '&%#!HC3F';
class QuickAppResolver implements Resolver { // QuickApp -> populates QuickAppDir
	hc3: HC3;
	resolved: Map<string, boolean> = new Map();

	constructor(hc3: HC3) {
		this.hc3 = hc3;
	}
	async write(name:string,content:string) {
		await this.hc3.writeFile(name, Buffer.from(content));
	}
	async resolve(path:string,read:boolean): Promise<void> {
		if (this.resolved.has(path)) { return; }
		const id = Number(path.match(/(\d+)/)![1]);
		const rsrc = await this.hc3.api.getQA(id);
		const files = await this.hc3.api.getQAfiles(id);
		const write = async (name:string,content:string) => 
			await this.hc3.writeFile(`${path}/${name}`,Buffer.from(content));
		for (const [fname, isMain] of files.entries()) {
			await write(fname+'.lua', `${FILEMARK} QAFILE ${id} ${fname}`);
		}
		await write('.rsrc.json', JSON.stringify(rsrc, null, 2));
		const buff = new StringBuffer();
		buff.add(`--%%root=${path}/\n`);
		buff.add(`--%%name=${rsrc.name}\n`);
		buff.add(`--%%id=${rsrc.id}\n`);
		buff.add(`--%%type=${rsrc.type}\n`);
		for (const [fname, isMain] of files.entries()) {
			buff.add(`--%%file=${fname}.lua,${fname !== 'main' && fname || 'main2'};\n`);
		}
		await write('.run.lua',buff.toString());
		this.resolved.set(path,true)
		logfs(`QuickAppResolver: resolved ${path}`);
	}

	async decorate(path:string): Promise<vscode.FileDecoration | undefined> {
		return;
	}
}

class ScenesResolver implements Resolver { // Scene -> populates ScenesDir
	initialised = false;
	hc3: HC3;
	constructor(hc3: HC3) {
		this.hc3 = hc3;
	}
	async resolve(path:string,read:boolean): Promise<void> {
		if (this.initialised) { return; }
		const scenes = await this.hc3.api.getScenes();
		for (const scene of scenes) {
			let dpath = `${path}/${scene.id} ${scene.name}`;
			dpath = dpath.replace(/ /g, '_');
			await this.hc3.createDir(dpath);
		}
		logfs(`ScenesResolver: resolved ${path}`);
		this.initialised = true;
	}

	async decorate(path:string): Promise<vscode.FileDecoration | undefined> {
		return;
	}
}

class SceneResolver implements Resolver { // Scene -> populates ScenesDir
	hc3: HC3;
	resolved: Map<string, boolean> = new Map();
	constructor(hc3: HC3) {
		this.hc3 = hc3;
	}
	async resolve(path:string,read:boolean): Promise<void> {
		if (this.resolved.has(path)) { return; }
		const id = Number(path.match(/(\d+)/)![1]);
		const rsrc = await this.hc3.api.getScene(id);
		const write = async (name:string,content:string) => 
			await this.hc3.writeFile(`${path}/${name}`,Buffer.from(content));
		write('.rsrc.json',JSON.stringify(rsrc, null, 2));
    if (rsrc.type === "lua" || rsrc.type === "scenario") {
      const cont = JSON.parse(rsrc.content);
      write('conditions.lua',cont.conditions);
      write('actions.lua',cont.actions);
    } else if (rsrc.type === "json") {
      const cont = JSON.parse(rsrc.content);
      write('block.json',JSON.stringify(cont,null,2));
    }
		this.resolved.set(path,true);
		logfs(`SceneResolver: resolved ${path}`);
	}

	async decorate(path:string): Promise<vscode.FileDecoration | undefined> {
		return;
	}
}

async function resolveFile(hc3: HC3, path: string, data: string): Promise<string> {
	const res = data.match(/QAFILE (\d+) (.+)/);
	const content = await hc3.api.getQAfileContent(Number(res![1]),res![2]);
	await hc3.writeFile(path, content);
	return content.toString();
}

class FileResolver implements Resolver { // File -> ...
	hc3: HC3;
	resolvedFiles: Map<string, any> = new Map();
	constructor(hc3: HC3) {
		this.hc3 = hc3;
	}
	invalidateFile(path:string) {
		this.resolvedFiles.delete(path);
	}
	async resolve(path:string,read:boolean): Promise<void> {
		if (this.resolvedFiles.has(path)) { return; }
		if (await fileExist(this.hc3.fdir+path)) {
			if (read) { // Resolve from a read operation
				let data = (await this.hc3.readFile(path)).toString();
				if (data.toString().startsWith(FILEMARK)) {
					data = await resolveFile(this.hc3, path, data);
				}
				this.resolvedFiles.set(path, data);
			} else { 
				this.resolvedFiles.set(path, true);
			}
			return;
		}
		throw vscode.FileSystemError.FileNotFound();
	}

	async decorate(path:string): Promise<vscode.FileDecoration | undefined> {
		return;
	}
}

export function getResolvers(hc3: HC3): Map<string, Resolver[]> {
  const resolvers: Map<string, Resolver[]> = new Map();
  resolvers.set('QuickApp', [
    new QuickAppsResolver(hc3), 
    new QuickAppResolver(hc3),
    new FileResolver(hc3)
  ]);
  resolvers.set('Scene', [
    new ScenesResolver(hc3), 
    new SceneResolver(hc3),
    new FileResolver(hc3)
  ]);
  return resolvers;
}