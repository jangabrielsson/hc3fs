'use strict';

import * as vscode from 'vscode';

import { HC3FS } from './fileSystemProvider';

async function refreshFilesFromHC3(hc3Fs: HC3FS) {
	try {
		const resp = await hc3Fs.callHC3("GET",'/devices?interface=quickApp');
		const data = resp as Array<any>;
		for (const device of data) {
			//hc3Fs.debug(device.name);
			// Create a QA directory for each device
			const name = `hc3fs:/${device.id}_${device.name}/`;
			hc3Fs.allowDirs = true;
			hc3Fs.createDirectory(vscode.Uri.parse(name));
			hc3Fs.allowDirs = false;
			// Add .rsrc.json file to each directory for device resource
			hc3Fs.writeFile(vscode.Uri.parse(`${name}.rsrc.json`), Buffer.from(JSON.stringify(device,null,2)), { create: true, overwrite: true });
		}
		hc3Fs.initialized();
	} catch(err) {
		vscode.window.showErrorMessage(`${err}`);
		throw err;
	}
}
export function activate(context: vscode.ExtensionContext) {

	console.log('hc3fs says "Hello"');
	let conf = vscode.workspace.getConfiguration('files');
	conf.update('autoSave', 'off');

	conf = vscode.workspace.getConfiguration('hc3fs');
	const pwd = conf.password;
	const user = conf.user;
	const url = conf.url;
	const vdir = conf.dir;
	const hlog = conf.hc3log;
	const debug = conf.debug;
	
	let initialized = false;
	const hc3Fs = new HC3FS(user,pwd,url,vdir,hlog,debug);
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('hc3fs', hc3Fs, { isCaseSensitive: true }));
	refreshFilesFromHC3(hc3Fs);
	// context.subscriptions.push(vscode.commands.registerCommand('hc3fs.reset', _ => {
	// 	for (const [name] of hc3Fs.readDirectory2(vscode.Uri.parse('hc3fs:/'))) {
	// 		hc3Fs.delete(vscode.Uri.parse(`hc3fs:/${name}`));
	// 	}
	// 	initialized = false;
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.init', _ => {
		if (initialized) {
			return;
		}
		refreshFilesFromHC3(hc3Fs);
		initialized = true;
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.workspaceInit', _ => {
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('hc3fs:/'), name: `HC3FS - ${url}` });
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.toggleLog', _ => {
		hc3Fs.toggleLog();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('hc3fs.downloadFQA', x => {
		console.log(x);
	}));
}

