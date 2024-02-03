# hc3fs README

This is a fileSystemProvider extension for vscode that "mounts" the Fibaro HC3 as a fileSystem making it available in the vscode File Explorer.
Currently only QuickApps and Scenes are availabe.

## Features

Allow you to edit and manage QuickApp files from within vscode.
Optional, all HC3 logs can be funneled into the vscode terminal so this way QA files can be edited, saved, and the effect be seen in the vscode Terminal. In principle allowing you use vscode as the editor when developing QAs on the HC3. Enabling Logs are done in settings or with the options in the Terminals context menu

QAs can be downloaded as a .fqa using the File explorer context menu

There is also rudimentary support to view Scenes.

## Requirements

You need the URL of your HC3, ex. http://192.168.1.57/.
You need to admin username and password

## Extension Settings

This extension contributes the following settings:

* `hc3fs.url`: Set to URL of HC3.
* `hc3fs.user`: Set to username for HC3.
* `hc3fs.password`: Set to password for HC3.
* `hc3fs.hc3log`: true/false if logs from HC3 should be displayed in terminal window.
* `hc3fs.debug`: Enables extra deug logs of hc3fs file operations.


## Known Issues

Still early in development.
No sync back when QAs changed on the HC3.
QAs can't be created,deleted or renamed in vscode.

## Release Notes

### 1.0.0

Initial release of hc3fs
* QuickApps and Scenes are "mounted"
* QuickApps support editing/adding/deleting/renaming files
* Scenes only support viewing of files

* Changes in QuickApp files are synched to the HC3 but changes on the HC3 is not synched back yet to vscode (being implemented)
* HC3 Web UI may need to be reloaded if the QA is open to see the changes.

---

**Enjoy!**
