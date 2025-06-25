import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {scanWorkspaceForTasks} from "../../src/taskParser";

suite("taskParser", () => {
  let getConfigStub: sinon.SinonStub;

  setup(() => {
    getConfigStub = sinon.stub(vscode.workspace, "getConfiguration");
  });

  teardown(() => {
    sinon.restore();
  });

  test("should parse task comment with priority and pinned flag", async () => {
    const mockConfig = {
      get: sinon.stub().withArgs('todoPatterns').returns(undefined),
    };

    getConfigStub.withArgs("intelligentTasks").returns(mockConfig as any);
    const stubDoc = {
      fileName: "/workspace/file.ts",
      lineCount: 1,
      lineAt: () => ({text: "// TODO(high)*: refactor the parser"})
    };

    sinon.stub(vscode.workspace, "workspaceFolders").value([{uri: vscode.Uri.file("/workspace")}]);
    sinon.stub(vscode.workspace, "findFiles").resolves([vscode.Uri.file("/workspace/file.ts")]);
    sinon.stub(vscode.workspace, "openTextDocument").resolves(stubDoc as any);

    const tasks = await scanWorkspaceForTasks();
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].type, "TODO");
    assert.strictEqual(tasks[0].priority, "high");
    assert.strictEqual(tasks[0].pinned, true);
    assert.strictEqual(tasks[0].text, "refactor the parser");
  });
});
