import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {activate} from "../../src/extension";

suite("Extension Activation", () => {
  let context: vscode.ExtensionContext;
  let subscriptions: any[];

  setup(() => {
    subscriptions = [];
    context = {
      subscriptions,
      // остальные поля не нужны для теста activate
    } as unknown as vscode.ExtensionContext;
  });

  test("activate registers commands", async () => {
    const registerCommandStub = sinon.stub(vscode.commands, "registerCommand").callsFake(() => ({
      dispose: () => {
      },
    }));

    await activate(context);

    assert.ok(registerCommandStub.called, "registerCommand должен быть вызван");
    assert.ok(subscriptions.length > 0, "контекст должен содержать подписки");

    registerCommandStub.restore();
  });
});
