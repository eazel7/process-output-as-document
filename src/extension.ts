import * as vscode from "vscode";
import * as child_process from "child_process";

interface DocumentAsProcess {
  processId: string;
  process: child_process.ChildProcess;
  allOutput: string;
  uri: vscode.Uri;
}

interface NewOutputLines {
  processId: string;
  data: any;
}

const scheme = "process";

class ProcessOutputDocumentProvider
  implements vscode.TextDocumentContentProvider
{
  private processes: DocumentAsProcess[];
  constructor(
    processes: DocumentAsProcess[],
    newOutputLinesEvent: vscode.Event<NewOutputLines>
  ) {
    this.processes = processes;
    newOutputLinesEvent((newLines) => {
      let process = processes.filter((p) => p.processId === newLines.processId)[0];
      if (process !== undefined) {
        process.allOutput = [process.allOutput, newLines.data as String].join(
          "\n"
        );
        this.onDidChangeEmitter.fire(process.uri);
      }
    });
  }

  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<string> {
    let process = this.processes.filter(
      (p) => p.uri.toString() === uri.toString()
    )[0];

    if (process !== undefined) {
      return process.allOutput;
    } else {
      return "";
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  let lastProcessId = 0;
  let processes: DocumentAsProcess[] = [];
  let newOutputLines = new vscode.EventEmitter<NewOutputLines>();

  let provider = new ProcessOutputDocumentProvider(
    processes,
    newOutputLines.event
  );

  vscode.workspace.registerTextDocumentContentProvider("process", provider);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "process-output-as-document.runProcess",
      async () => {
        let command = await vscode.window.showInputBox({
          title: "What is the command to run?",
          placeHolder: "journalctl -f",
        });

        if (command === undefined) {
          return;
        }

        // spawn the process
        let newProcess = child_process.exec(command, {});
        // new process id (internal, for document reference really)

        lastProcessId++;

        let processId = lastProcessId.toString();

        newProcess.stdout?.addListener("data", (chunk) => {
          newOutputLines.fire({
            data: chunk,
            processId: processId,
          });
        });

        const uri = vscode.Uri.from({
          scheme: scheme,
          authority: processId,
          path: "/" + command
        });
        processes.push({
          processId: processId,
          process: newProcess,
          allOutput: "",
          uri: uri
        });

        const doc = await vscode.workspace.openTextDocument(uri); // calls back into the provider
        const docWindow = await vscode.window.showTextDocument(doc, {
          preview: false,
        });

        let editor = vscode.window.visibleTextEditors.filter(
          (e) => e.document.uri.toString() === doc.uri.toString()
        )[0];
        
        vscode.workspace.onDidCloseTextDocument((d) => {
          debugger;
          if (d.uri.scheme === scheme) {
            let processAsDoc = processes.filter(
              (p) => p.processId === d.uri.authority
            )[0];
            if (processAsDoc !== undefined) {
              processAsDoc.process.disconnect();
              processAsDoc.process.stdin?.removeAllListeners("data");
            }
          }
        });
        editor.selection = new vscode.Selection(0, 0, 0, 0);
      }
    )
  );
}

export function deactivate() {}
