// Pure code generation: shared by the editor and automated tests.
export const LANGUAGES = ['cURL', 'Bash', 'JavaScript Fetch', 'Node.js Axios', 'Python Requests', 'PHP cURL', 'Go', 'Ruby Net::HTTP'];
const sh = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const php = value => "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
const ruby = php;
const j = value => JSON.stringify(String(value));
export function requestHeaders(r) {
  const headers = {};
  r.headers.filter(h => h.name.trim()).forEach(h => {
    const existing = Object.keys(headers).find(k => k.toLowerCase() === h.name.trim().toLowerCase());
    const key = existing || h.name.trim();
    headers[key] = existing ? `${headers[key]}, ${h.value}` : h.value;
  });
  const contentType = Object.keys(headers).find(k => k.toLowerCase() === 'content-type');
  if (r.payloadType === 'multipart' && contentType) delete headers[contentType];
  if (!['GET', 'HEAD'].includes(r.method) && r.payloadType === 'json' && !contentType) headers['Content-Type'] = 'application/json';
  return headers;
}
export function generateCode(r, language) {
  const headers = requestHeaders(r);
  const hasBody = !['GET', 'HEAD'].includes(r.method);
  const multipart = hasBody && r.payloadType === 'multipart';
  const fields = r.fields.filter(f => f.name);
  const files = multipart && fields.some(f => f.isFile);
  const body = hasBody && !multipart ? r.body : '';
  if (language === 'cURL' || language === 'Bash') {
    const lines = [`curl --request ${r.method} ${sh(r.url)}`];
    Object.entries(headers).forEach(([k, v]) => lines.push(`  --header ${sh(`${k}: ${v}`)}`));
    if (multipart) fields.forEach(f => lines.push(f.isFile ? `  --form ${sh(`${f.name}=@${f.value || 'path/to/file'}`)}` : `  --form-string ${sh(`${f.name}=${f.value}`)}`));
    else if (hasBody) lines.push(`  --data-raw ${sh(body)}`);
    return (language === 'Bash' ? '#!/usr/bin/env bash\nset -euo pipefail\n\n' : '') + lines.join(' \\\n');
  }
  if (language === 'JavaScript Fetch' || language === 'Node.js Axios') {
    const node = language === 'Node.js Axios';
    let code = node ? 'import axios from "axios";\n' : '';
    if (files && node) code += 'import { readFile } from "node:fs/promises";\n';
    if (multipart) {
      code += '\nconst form = new FormData();\n';
      fields.forEach((f, i) => {
        if (f.isFile) {
          if (node) code += `form.append(${j(f.name)}, new Blob([await readFile(${j(f.value || 'path/to/file')})]), ${j(f.value.split(/[\\/]/).pop() || 'file')});\n`;
          else code += `// Select the file matching ${j(f.value || 'path/to/file')} in your page.\nconst file${i} = document.querySelectorAll('input[type="file"]')[${fields.filter((x, n) => n < i && x.isFile).length}]?.files[0];\nif (!file${i}) throw new Error("Select an upload file first.");\nform.append(${j(f.name)}, file${i});\n`;
        } else code += `form.append(${j(f.name)}, ${j(f.value)});\n`;
      });
    }
    if (node) {
      code += `\nconst response = await axios({\n  method: ${j(r.method)},\n  url: ${j(r.url)},\n  headers: ${JSON.stringify(headers, null, 2)},\n  responseType: "arraybuffer",\n  validateStatus: () => true${hasBody ? `,\n  data: ${multipart ? 'form' : j(body)}` : ''}\n});\nconsole.log(response.status, response.headers);\nconsole.log(response.data);`;
    } else {
      code += `\nconst response = await fetch(${j(r.url)}, {\n  method: ${j(r.method)},\n  headers: ${JSON.stringify(headers, null, 2)}${hasBody ? `,\n  body: ${multipart ? 'form' : j(body)}` : ''}\n});\nconsole.log(response.status, Object.fromEntries(response.headers));\n// Use response.text(), .json(), or .blob() according to Content-Type.\nconst result = await response.blob();\nconsole.log(result);`;
    }
    return code.trim();
  }
  if (language === 'Python Requests') {
    let code = 'import requests\n';
    if (files) code += 'from contextlib import ExitStack\n';
    code += `\nurl = ${j(r.url)}\nheaders = ${JSON.stringify(headers, null, 2)}\n`;
    if (multipart) {
      // A (None, value) file tuple preserves repeated text fields in multipart encoding.
      const entries = fields.map(f => `    (${j(f.name)}, ${f.isFile ? `(${j(f.value.split(/[\\/]/).pop() || 'file')}, stack.enter_context(open(${j(f.value || 'path/to/file')}, "rb")))` : `(None, ${j(f.value)})`})`);
      if (files) code += '\nwith ExitStack() as stack:\n';
      const indent = files ? '    ' : '';
      code += indent + 'fields = [\n' + entries.map(x => indent + x).join(',\n') + '\n' + indent + ']\n';
      code += `${indent}response = requests.request(${j(r.method)}, url, headers=headers, files=fields, timeout=60)\n`;
    } else code += `response = requests.request(${j(r.method)}, url, headers=headers${hasBody ? `, data=${j(body)}.encode("utf-8")` : ''}, timeout=60)\n`;
    return code + 'print(response.status_code, dict(response.headers))\nprint(response.content)\n';
  }
  if (language === 'PHP cURL') {
    let code = '<?php\n';
    const h = Object.entries(headers).map(([k, v]) => php(`${k}: ${v}`));
    if (multipart) {
      // Construct the body explicitly to preserve repeated field names.
      code += '$boundary = "----Lodearink" . bin2hex(random_bytes(12));\n$body = "";\n';
      fields.forEach(f => {
        const name = f.name.replaceAll('"', '%22').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
        const filename = (f.value.split(/[\\/]/).pop() || 'file').replaceAll('"', '%22').replaceAll('\r', '').replaceAll('\n', '');
        code += '$body .= "--" . $boundary . "\\r\\n" . ' + php(`Content-Disposition: form-data; name="${name}"${f.isFile ? `; filename="${filename}"` : ''}\r\n${f.isFile ? 'Content-Type: application/octet-stream\r\n' : ''}\r\n`) + ';\n';
        code += `$body .= ${f.isFile ? `file_get_contents(${php(f.value || 'path/to/file')})` : php(f.value)} . "\\r\\n";\n`;
      });
      code += '$body .= "--" . $boundary . "--\\r\\n";\n';
      h.push('"Content-Type: multipart/form-data; boundary=" . $boundary');
    }
    code += `$ch = curl_init(${php(r.url)});\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => ${php(r.method)},\n    CURLOPT_HTTPHEADER => [${h.join(', ')}],\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_TIMEOUT => 60${hasBody ? `,\n    CURLOPT_POSTFIELDS => ${multipart ? '$body' : php(body)}` : ''}\n]);\n$response = curl_exec($ch);\nif ($response === false) { throw new RuntimeException(curl_error($ch)); }\necho "HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . "\\n";\necho $response;\ncurl_close($ch);\n`;
    return code;
  }
  if (language === 'Go') {
    const imports = ['"fmt"', '"io"', '"net/http"', '"time"'];
    if (hasBody) imports.push('"bytes"');
    if (multipart) imports.push('"mime/multipart"');
    if (files) imports.push('"os"', '"path/filepath"');
    let code = `package main\n\nimport (\n  ${imports.join('\n  ')}\n)\n\nfunc must(err error) { if err != nil { panic(err) } }\n\nfunc main() {\n`;
    if (multipart) {
      code += '  var payload bytes.Buffer\n  writer := multipart.NewWriter(&payload)\n';
      fields.forEach((f, i) => {
        if (f.isFile) code += `  file${i}, err := os.Open(${j(f.value || 'path/to/file')}); must(err)\n  defer file${i}.Close()\n  part${i}, err := writer.CreateFormFile(${j(f.name)}, filepath.Base(${j(f.value || 'path/to/file')})); must(err)\n  _, err = io.Copy(part${i}, file${i}); must(err)\n`;
        else code += `  must(writer.WriteField(${j(f.name)}, ${j(f.value)}))\n`;
      });
      code += '  must(writer.Close())\n';
    }
    code += `  req, err := http.NewRequest(${j(r.method)}, ${j(r.url)}, ${hasBody ? multipart ? '&payload' : `bytes.NewBufferString(${j(body)})` : 'nil'})\n  must(err)\n`;
    Object.entries(headers).forEach(([k, v]) => {code += `  req.Header.Set(${j(k)}, ${j(v)})\n`;});
    if (multipart) code += '  req.Header.Set("Content-Type", writer.FormDataContentType())\n';
    code += '  client := &http.Client{Timeout: 60 * time.Second}\n  res, err := client.Do(req); must(err)\n  defer res.Body.Close()\n  result, err := io.ReadAll(res.Body); must(err)\n  fmt.Println(res.Status, res.Header)\n  fmt.Println(string(result))\n}\n';
    return code;
  }
  if (language === 'Ruby Net::HTTP') {
    const methods = {GET: 'Get', POST: 'Post', PUT: 'Put', PATCH: 'Patch', DELETE: 'Delete', HEAD: 'Head', OPTIONS: 'Options'};
    let code = `require 'net/http'\nrequire 'uri'\n\nuri = URI(${ruby(r.url)})\nrequest = Net::HTTP::${methods[r.method]}::new(uri)\n`;
    Object.entries(headers).forEach(([k, v]) => {code += `request[${ruby(k)}] = ${ruby(v)}\n`;});
    if (multipart) {
      fields.filter(f => f.isFile).forEach((f, i) => {code += `file${i} = File.open(${ruby(f.value || 'path/to/file')}, 'rb')\n`;});
      let fileIndex = 0;
      code += 'request.set_form([\n' + fields.map(f => `  [${ruby(f.name)}, ${f.isFile ? `file${fileIndex++}` : ruby(f.value)}]`).join(',\n') + "\n], 'multipart/form-data')\n";
    } else if (hasBody) code += `request.body = ${ruby(body)}\n`;
    code += '\nresponse = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == \'https\', read_timeout: 60) { |http| http.request(request) }\nputs response.code, response.to_hash, response.body\n';
    if (files) code += fields.filter(f => f.isFile).map((_, i) => `file${i}.close`).join('\n') + '\n';
    return code;
  }
  throw new Error(`Unknown language: ${language}`);
}
