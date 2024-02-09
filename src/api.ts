export class API {
  creds: string;
  base: string;
  qas: Map<number,any> = new Map<number,any>();
  scenes: Map<number,any> = new Map<number,any>();

  constructor(base: string, creds: string) {
    this.base = base;
    this.creds = creds;
  }

  async callHC3(method: string, path: string, data?: string) : Promise<any> {
		const resp = await fetch(this.base+path, {
			method: method,
			headers: {
				'authorization': this.creds,
				'content-type': 'application/json',
				'X-Fibaro-Version': '2',
				'accept': '*/*',
			},
			body: data,
		});
		if (resp.ok) {
			const data = await resp.text(); // Some calls return empty response but status ok
			if (data && data.length > 0) {
				return JSON.parse(data);
			} else {
				return null;
			}
		} else {
			throw new Error(`${resp.status} - ${resp.statusText}`);
		}
	}

  async getQAs() : Promise<Map<string,any>> {
    const res = await this.callHC3("GET",`/devices?interface=quickApp`);
    const data = new Map<string,any>;
    this.qas = new Map<number,any>();
    res.map((d:any) => {
      data.set(d.name,d);
      this.qas.set(d.id,d);
    });
    return data;
  }

  async getQA(id: number) : Promise<any> {
    return this.qas.get(id);
  }

  async getQAfiles(id: number) : Promise<Map<string,boolean>> {
    const res = await this.callHC3("GET",`/quickApp/${id}/files`);
    const data = new Map<string,boolean>;
    res.map((d:any) => data.set(d.name,d.isMain));
    return data;
  }

  async getQAfileContent(id: number, name:string) : Promise<Uint8Array> {
    const res = await this.callHC3("GET",`/quickApp/${id}/files/${name}`);
    return Buffer.from(res.content);
  }

  async deleteQAfile(id: number, name:string) {
    return await this.callHC3("DELETE",`/quickApp/${id}/files/${name}`);
  }

  async renameQAfile(id: number, name:string, newName:string) {
    return await this.callHC3("PUT",`/quickApp/${id}/files/${name}`,JSON.stringify({name:newName}));
  }

  async getScenes(): Promise<any[]> {
    const scenes = await this.callHC3("GET",`/scenes`);
    this.scenes = new Map<number,any>();
    scenes.map((s:any) => {
      this.scenes.set(s.id,s);
    });
    return scenes;
  }

  async getScene(id: number): Promise<any> {
    return this.scenes.get(id);
  }
  
  async getInfo(): Promise<any> {
    return await this.callHC3("GET", "/settings/info/");
  }

  async getDebugMessages(from: number): Promise<any> {
    return await this.callHC3("GET", `/debugMessages?from=${from}`);
  }

  async getRefresh(last: number): Promise<any> {
    return await this.callHC3("GET", `/refreshStates?last=${last}`);
  }
}