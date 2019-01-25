import { Widget, WEnv } from "../src/ts/core/widget";
import { idGenerator } from "../src/ts/core/utils";
import { QWeb } from "../src/ts/core/qweb_vdom";

interface Type<T> extends Function {
  new (...args: any[]): T;
}

type TestEnv = WEnv;
type TestWidget = Widget<TestEnv>;

function makeWidget(W: Type<TestWidget>): TestWidget {
  const env: WEnv = {
    qweb: new QWeb(),
    getID: idGenerator()
  };
  const w = new W(env);
  return w;
}

async function click(el: HTMLElement) {
  el.click();
  return Promise.resolve();
}

const template = `
    <div><t t-esc="state.counter"/><button t-on-click="inc">Inc</button></div>
`;

class Counter extends Widget<TestEnv> {
  name = "counter";
  template = template;
  state = {
    counter: 0
  };

  inc() {
    this.updateState({ counter: this.state.counter + 1 });
  }
}

describe("basic widget properties", () => {
  test("has no el after creation", async () => {
    const widget = makeWidget(Widget);
    expect(widget.el).toBe(null);
  });

  test("can be mounted", async () => {
    const widget = makeWidget(Widget);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(target.innerHTML).toBe("<div></div>");
  });

  test("can be clicked on and updated", async () => {
    const counter = makeWidget(Counter);
    const target = document.createElement("div");
    await counter.mount(target);
    expect(target.innerHTML).toBe("<div>0<button>Inc</button></div>");
    await click((<HTMLElement>counter.el).getElementsByTagName("button")[0]);
    expect(target.innerHTML).toBe("<div>1<button>Inc</button></div>");
  });

  test("widget style and classname", async () => {
    class StyledWidget extends Widget<TestEnv> {
      template = `<div style="font-weight:bold;" class="some-class">world</div>`;
    }
    const widget = makeWidget(StyledWidget);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(target.innerHTML).toBe(
      `<div style="font-weight:bold;" class="some-class">world</div>`
    );
  });

  test("updateState before first render does not trigger a render", async () => {
    let renderCalls = 0;
    class TestW extends Widget<TestEnv> {
      async willStart() {
        this.updateState({});
      }
      async render() {
        renderCalls++;
        return super.render();
      }
    }
    const widget = makeWidget(TestW);
    await widget.mount(document.createElement("div"));
    expect(renderCalls).toBe(1);
  });
});

describe("lifecycle hooks", () => {
  test("willStart hook is called", async () => {
    let willstart = false;
    class HookWidget extends Widget<TestEnv> {
      async willStart() {
        willstart = true;
      }
    }
    const widget = makeWidget(HookWidget);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(willstart).toBe(true);
  });

  test("mounted hook is not called if not in DOM", async () => {
    let mounted = false;
    class HookWidget extends Widget<TestEnv> {
      async mounted() {
        mounted = true;
      }
    }
    const widget = makeWidget(HookWidget);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(mounted).toBe(false);
  });

  test("mounted hook is called if mounted in DOM", async () => {
    let mounted = false;
    class HookWidget extends Widget<TestEnv> {
      async mounted() {
        mounted = true;
      }
    }
    const widget = makeWidget(HookWidget);
    const target = document.createElement("div");
    document.body.appendChild(target);
    await widget.mount(target);
    expect(mounted).toBe(true);
    target.remove();
  });

  test("willStart hook is called on subwidget", async () => {
    expect.assertions(1);
    let ok = false;
    class ParentWidget extends Widget<TestEnv> {
      name = "a";
      template = `<div><t t-widget="child"/></div>`;
      widgets = { child: ChildWidget };
    }
    class ChildWidget extends Widget<TestEnv> {
      async willStart() {
        ok = true;
      }
    }
    const widget = makeWidget(ParentWidget);
    const target = document.createElement("div");
    document.body.appendChild(target);
    await widget.mount(target);
    expect(ok).toBe(true);
    target.remove();
  });

  test("mounted hook is called on subwidgets, in proper order", async () => {
    expect.assertions(4);
    let parentMounted = false;
    let childMounted = false;
    class ParentWidget extends Widget<TestEnv> {
      name = "a";
      template = `<div><t t-widget="child"/></div>`;
      widgets = { child: ChildWidget };
      mounted() {
        expect(childMounted).toBe(false);
        parentMounted = true;
      }
    }
    class ChildWidget extends Widget<TestEnv> {
      mounted() {
        expect(document.body.contains(this.el)).toBe(true);
        expect(parentMounted).toBe(true);
        childMounted = true;
      }
    }
    const widget = makeWidget(ParentWidget);
    const target = document.createElement("div");
    document.body.appendChild(target);
    await widget.mount(target);
    expect(childMounted).toBe(true);
    target.remove();
  });

  test("willStart, mounted on subwidget rendered after main is mounted in some other position", async () => {
    expect.assertions(3);
    let hookCounter = 0;
    class ParentWidget extends Widget<TestEnv> {
      name = "a";
      state = { ok: false };
      template = `
        <div>
          <t t-if="state.ok">
            <t t-widget="child"/>
          </t>
          <t t-else="1">
            <div/>
          </t>
        </div>`; // the t-else part in this template is important. This is
      // necessary to have a situation that could confuse the vdom
      // patching algorithm
      widgets = { child: ChildWidget };
    }
    class ChildWidget extends Widget<TestEnv> {
      async willStart() {
        hookCounter++;
      }
      mounted() {
        expect(hookCounter).toBe(1);
        hookCounter++;
      }
    }
    const widget = makeWidget(ParentWidget);
    const target = document.createElement("div");
    document.body.appendChild(target);
    await widget.mount(target);
    expect(hookCounter).toBe(0); // sub widget not created yet
    await widget.updateState({ ok: true });
    expect(hookCounter).toBe(2);
    target.remove();
  });

  test("mounted hook is correctly called on subwidgets created in mounted hook", async done => {
    // the issue here is that the parent widget creates in the
    // mounted hook a new widget, which means that it modifies
    // in place its list of children. But this list of children is currently
    // being visited, so the mount action of the parent could cause a mount
    // action of the new child widget, even though it is not ready yet.
    expect.assertions(1);

    const target = document.createElement("div");
    document.body.appendChild(target);
    class ParentWidget extends Widget<TestEnv> {
      name = "a";
      mounted() {
        const child = new ChildWidget(this);
        child.mount(this.el!);
      }
    }
    class ChildWidget extends Widget<TestEnv> {
      mounted() {
        expect(this.el).toBeTruthy();
        target.remove();
        done();
      }
    }

    const widget = makeWidget(ParentWidget);
    await widget.mount(target);
  });
});

describe("destroy method", () => {
  test("destroy remove the widget from the DOM", async () => {
    const widget = makeWidget(Widget);
    const target = document.body;
    await widget.mount(target);
    expect(document.contains(widget.el)).toBe(true);
    widget.destroy();
    expect(document.contains(widget.el)).toBe(false);
  });
});

describe("composition", () => {
  class WidgetA extends Widget<TestEnv> {
    name = "a";
    template = `<div>Hello<t t-widget="b"/></div>`;
    widgets = { b: WidgetB };
  }

  class WidgetB extends Widget<TestEnv> {
    template = `<div>world</div>`;
  }

  test("a widget with a sub widget", async () => {
    const widget = makeWidget(WidgetA);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(target.innerHTML).toBe("<div>Hello<div>world</div></div>");
  });

  test("t-refs on widget are widgets", async () => {
    class WidgetC extends Widget<TestEnv> {
      name = "a";
      template = `<div>Hello<t t-ref="mywidgetb" t-widget="b"/></div>`;
      widgets = { b: WidgetB };
    }
    const widget = makeWidget(WidgetC);
    const target = document.createElement("div");
    await widget.mount(target);
    expect(widget.refs.mywidgetb instanceof WidgetB).toBe(true);
  });
});