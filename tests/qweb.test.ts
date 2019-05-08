import { EvalContext, QWeb } from "../src/qweb_core";
import { patch } from "../src/vdom";
import { normalize } from "./helpers";

//------------------------------------------------------------------------------
// Setup and helpers
//------------------------------------------------------------------------------

// We create before each test:
// - qweb: a new QWeb instance

let qweb: QWeb;

beforeEach(() => {
  qweb = new QWeb();
});

function trim(str: string): string {
  return str.replace(/\s/g, "");
}

function renderToDOM(
  qweb: QWeb,
  template: string,
  context: EvalContext = {},
  extra?: any
): HTMLElement | Text {
  const vnode = qweb.render(template, context, extra);

  // we snapshot here the compiled code. This is useful to prevent unwanted code
  // change.
  expect(qweb.templates[template].fn.toString()).toMatchSnapshot();

  if (vnode.sel === undefined) {
    return document.createTextNode(vnode.text!);
  }
  const node = document.createElement(vnode.sel!);
  const result = patch(node, vnode);
  return result.elm as HTMLElement;
}

function renderToString(
  qweb: QWeb,
  t: string,
  context: EvalContext = {}
): string {
  const node = renderToDOM(qweb, t, context);
  return node instanceof Text ? node.textContent! : node.outerHTML;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("static templates", () => {
  test("simple string", () => {
    qweb.addTemplate("test", "<t>hello vdom</t>");
    expect(renderToString(qweb, "test")).toBe("hello vdom");
  });

  test("empty div", () => {
    qweb.addTemplate("test", "<div></div>");
    expect(renderToString(qweb, "test")).toBe("<div></div>");
  });

  test("div with a text node", () => {
    qweb.addTemplate("test", "<div>word</div>");
    expect(renderToString(qweb, "test")).toBe("<div>word</div>");
  });

  test("div with a span child node", () => {
    qweb.addTemplate("test", "<div><span>word</span></div>");
    expect(renderToString(qweb, "test")).toBe("<div><span>word</span></div>");
  });
});

describe("error handling", () => {
  test("invalid xml", () => {
    expect(() => qweb.addTemplate("test", "<div>")).toThrow(
      "Invalid XML in template"
    );
  });

  test("template with text node and tag", () => {
    qweb.addTemplate("test", `<t>text<span>other node</span></t>`);

    expect(() => renderToString(qweb, "test")).toThrow(
      "A template should not have more than one root node"
    );
  });

  test("nice warning if no template with given name", () => {
    expect(() => qweb.render("invalidname")).toThrow("does not exist");
  });

  test("cannot add twice the same template", () => {
    qweb.addTemplate("test", `<t></t>`);
    expect(() => qweb.addTemplate("test", "<div/>")).toThrow("already defined");
  });

  test("loadTemplates throw if parser error", () => {
    expect(() => {
      qweb.loadTemplates("<templates><abc>></templates>");
    }).toThrow("Invalid XML in template");
  });

  test("nice error when t-on-directive is evaluated with a missing handler", () => {
    qweb.addTemplate("templatename", `<div t-on-click="somemethod"></div>`);
    expect(() => qweb.render("templatename", {}, { handlers: [] })).toThrow(
      "Missing handler 'somemethod' when evaluating template 'templatename'"
    );
  });

  test("nice error when t-on is evaluated with a missing event", () => {
    qweb.addTemplate("templatename", `<div t-on="somemethod"></div>`);
    expect(() =>
      qweb.render("templatename", { someMethod() {} }, { handlers: [] })
    ).toThrow("Missing event name with t-on directive");
  });

  test("error when compiled code is invalid", () => {
    qweb.addTemplate(
      "templatename",
      `<div t-att-hey="}/^function invalid{{>'"></div>`
    );
    expect(() => qweb.render("templatename")).toThrow(
      "Invalid generated code while compiling template 'templatename': Unexpected token }"
    );
  });

  test("error when unknown directive", () => {
    qweb.addTemplate(
      "templatename",
      `<div t-best-beer="rochefort 10">test</div>`
    );
    expect(() => qweb.render("templatename")).toThrow(
      "Unknown QWeb directive: 't-best-beer'"
    );
  });
});

describe("t-esc", () => {
  test("literal", () => {
    qweb.addTemplate("test", `<span><t t-esc="'ok'"/></span>`);
    expect(renderToString(qweb, "test")).toBe("<span>ok</span>");
  });

  test("variable", () => {
    qweb.addTemplate("test", `<span><t t-esc="var"/></span>`);
    expect(renderToString(qweb, "test", { var: "ok" })).toBe("<span>ok</span>");
  });

  test.skip("escaping", () => {
    qweb.addTemplate("test", `<span><t t-esc="var"/></span>`);
    expect(renderToString(qweb, "test", { var: "<ok>" })).toBe(
      "<span>&lt;ok&gt;</span>"
    );
  });

  test("escaping on a node", () => {
    qweb.addTemplate("test", `<span t-esc="'ok'"/>`);
    expect(renderToString(qweb, "test")).toBe("<span>ok</span>");
  });

  test("escaping on a node with a body", () => {
    qweb.addTemplate("test", `<span t-esc="'ok'">nope</span>`);
    expect(renderToString(qweb, "test")).toBe("<span>ok</span>");
  });

  test("escaping on a node with a body, as a default", () => {
    qweb.addTemplate("test", `<span t-esc="var">nope</span>`);
    expect(renderToString(qweb, "test")).toBe("<span>nope</span>");
  });
});

describe("t-raw", () => {
  test("literal", () => {
    qweb.addTemplate("test", `<span><t t-raw="'ok'"/></span>`);
    expect(renderToString(qweb, "test")).toBe("<span>ok</span>");
  });

  test("variable", () => {
    qweb.addTemplate("test", `<span><t t-raw="var"/></span>`);
    expect(renderToString(qweb, "test", { var: "ok" })).toBe("<span>ok</span>");
  });

  test("not escaping", () => {
    qweb.addTemplate("test", `<div><t t-raw="var"/></div>`);
    expect(renderToString(qweb, "test", { var: "<ok></ok>" })).toBe(
      "<div><ok></ok></div>"
    );
  });

  test("t-raw and another sibling node", () => {
    qweb.addTemplate("test", `<span><span>hello</span><t t-raw="var"/></span>`);
    expect(renderToString(qweb, "test", { var: "<ok>world</ok>" })).toBe(
      "<span><span>hello</span><ok>world</ok></span>"
    );
  });
});

describe("t-set", () => {
  test("set from attribute literal", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="value" t-value="'ok'"/><t t-esc="value"/></div>`
    );
    expect(renderToString(qweb, "test")).toBe("<div>ok</div>");
  });

  test("t-set and t-if", () => {
    qweb.addTemplate(
      "test",
      `<div >
        <t t-set="v" t-value="value"/>
        <t t-if="v === 'ok'">grimbergen</t>
        </div>`
    );
    expect(renderToString(qweb, "test", { value: "ok" })).toBe(
      "<div>grimbergen</div>"
    );
  });

  test("set from body literal", () => {
    qweb.addTemplate(
      "test",
      `<t><t t-set="value">ok</t><t t-esc="value"/></t>`
    );
    expect(renderToString(qweb, "test")).toBe("ok");
  });

  test("set from attribute lookup", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="stuff" t-value="value"/><t t-esc="stuff"/></div>`
    );
    expect(renderToString(qweb, "test", { value: "ok" })).toBe("<div>ok</div>");
  });

  test("t-set evaluates an expression only once", () => {
    qweb.addTemplate(
      "test",
      `<div >
          <t t-set="v" t-value="value + ' artois'"/>
          <t t-esc="v"/>
          <t t-esc="v"/>
        </div>`
    );
    expect(renderToString(qweb, "test", { value: "stella" })).toBe(
      "<div>stella artoisstella artois</div>"
    );
  });

  test("set from body lookup", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="stuff"><t t-esc="value"/></t><t t-esc="stuff"/></div>`
    );
    expect(renderToString(qweb, "test", { value: "ok" })).toBe("<div>ok</div>");
  });

  test("set from empty body", () => {
    qweb.addTemplate("test", `<div><t t-set="stuff"/><t t-esc="stuff"/></div>`);
    expect(renderToString(qweb, "test")).toBe("<div></div>");
  });

  test("value priority", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="value" t-value="1">2</t><t t-esc="value"/></div>`
    );
    expect(renderToString(qweb, "test")).toBe("<div>1</div>");
  });

  test("evaluate value expression", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="value" t-value="1 + 2"/><t t-esc="value"/></div>`
    );
    expect(renderToString(qweb, "test")).toBe("<div>3</div>");
  });

  test("t-set should reuse variable if possible", () => {
    qweb.addTemplate(
      "test",
      `<div>
          <t t-set="v" t-value="1"/>
          <div t-foreach="list" t-as="elem" t-key="elem_index">
              <span>v<t t-esc="v"/></span>
              <t t-set="v" t-value="elem"/>
          </div>
        </div>`
    );
    expect(normalize(renderToString(qweb, "test", { list: ["a", "b"] }))).toBe(
      "<div><div><span>v1</span></div><div><span>va</span></div></div>"
    );
  });

  test("evaluate value expression, part 2", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="value" t-value="somevariable + 2"/><t t-esc="value"/></div>`
    );
    expect(renderToString(qweb, "test", { somevariable: 43 })).toBe(
      "<div>45</div>"
    );
  });
});

describe("t-if", () => {
  test("boolean value true condition", () => {
    qweb.addTemplate("test", `<div><t t-if="condition">ok</t></div>`);
    expect(renderToString(qweb, "test", { condition: true })).toBe(
      "<div>ok</div>"
    );
  });

  test("boolean value false condition", () => {
    qweb.addTemplate("test", `<div><t t-if="condition">ok</t></div>`);
    expect(renderToString(qweb, "test", { condition: false })).toBe(
      "<div></div>"
    );
  });

  test("boolean value condition missing", () => {
    qweb.addTemplate("test", `<span><t t-if="condition">fail</t></span>`);
    expect(renderToString(qweb, "test")).toBe("<span></span>");
  });

  test("boolean value condition elif", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-if="color == 'black'">black pearl</t>
        <t t-elif="color == 'yellow'">yellow submarine</t>
        <t t-elif="color == 'red'">red is dead</t>
        <t t-else="">beer</t></div>
    `
    );
    expect(renderToString(qweb, "test", { color: "red" })).toBe(
      "<div>red is dead</div>"
    );
  });

  test("boolean value condition else", () => {
    qweb.addTemplate(
      "test",
      `<div>
        <span>begin</span>
        <t t-if="condition">ok</t>
        <t t-else="">ok-else</t>
        <span>end</span>
      </div>
    `
    );
    const result = trim(renderToString(qweb, "test", { condition: true }));
    expect(result).toBe("<div><span>begin</span>ok<span>end</span></div>");
  });

  test("boolean value condition false else", () => {
    qweb.addTemplate(
      "test",
      `<div><span>begin</span><t t-if="condition">fail</t>
          <t t-else="">fail-else</t><span>end</span></div>
        `
    );
    const result = trim(renderToString(qweb, "test", { condition: false }));
    expect(result).toBe(
      "<div><span>begin</span>fail-else<span>end</span></div>"
    );
  });

  test("can use some boolean operators in expressions", () => {
    qweb.addTemplate(
      "test",
      `<div>
        <t t-if="cond1 and cond2">and</t>
        <t t-if="cond1 and cond3">nope</t>
        <t t-if="cond1 or cond3">or</t>
        <t t-if="cond3 or cond4">nope</t>
        <t t-if="m gt 3">mgt</t>
        <t t-if="n gt 3">ngt</t>
        <t t-if="m lt 3">mlt</t>
        <t t-if="n lt 3">nlt</t>
      </div>`
    );
    const context = {
      cond1: true,
      cond2: true,
      cond3: false,
      cond4: false,
      m: 5,
      n: 2
    };
    expect(normalize(renderToString(qweb, "test", context))).toBe(
      "<div>andormgtnlt</div>"
    );
  });
});

describe("attributes", () => {
  test("static attributes", () => {
    qweb.addTemplate("test", `<div foo="a" bar="b" baz="c"/>`);
    const result = renderToString(qweb, "test");
    const expected = `<div foo="a" bar="b" baz="c"></div>`;
    expect(result).toBe(expected);
  });

  test("static attributes with dashes", () => {
    qweb.addTemplate("test", `<div aria-label="Close"/>`);
    const result = renderToString(qweb, "test");
    const expected = `<div aria-label="Close"></div>`;
    expect(result).toBe(expected);
  });

  test("static attributes on void elements", () => {
    qweb.addTemplate("test", `<img src="/test.jpg" alt="Test"/>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<img src="/test.jpg" alt="Test">`);
  });

  test("dynamic attributes", () => {
    qweb.addTemplate("test", `<div t-att-foo="'bar'"/>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div foo="bar"></div>`);
  });

  test("dynamic attribute with a dash", () => {
    qweb.addTemplate("test", `<div t-att-data-action-id="id"/>`);
    const result = renderToString(qweb, "test", { id: 32 });
    expect(result).toBe(`<div data-action-id="32"></div>`);
  });

  test("dynamic formatted attributes with a dash", () => {
    qweb.addTemplate("test", `<div t-attf-aria-label="Some text {{id}}"/>`);
    const result = renderToString(qweb, "test", { id: 32 });
    expect(result).toBe(`<div aria-label="Some text 32"></div>`);
  });

  test("fixed variable", () => {
    qweb.addTemplate("test", `<div t-att-foo="value"/>`);
    const result = renderToString(qweb, "test", { value: "ok" });
    expect(result).toBe(`<div foo="ok"></div>`);
  });

  test("dynamic attribute falsy variable ", () => {
    qweb.addTemplate("test", `<div t-att-foo="value"/>`);
    const result = renderToString(qweb, "test", { value: false });
    expect(result).toBe(`<div></div>`);
  });

  test("tuple literal", () => {
    qweb.addTemplate("test", `<div t-att="['foo', 'bar']"/>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div foo="bar"></div>`);
  });

  test("tuple variable", () => {
    qweb.addTemplate("test", `<div t-att="value"/>`);
    const result = renderToString(qweb, "test", { value: ["foo", "bar"] });
    expect(result).toBe(`<div foo="bar"></div>`);
  });

  test("object", () => {
    qweb.addTemplate("test", `<div t-att="value"/>`);
    const result = renderToString(qweb, "test", {
      value: { a: 1, b: 2, c: 3 }
    });
    expect(result).toBe(`<div a="1" b="2" c="3"></div>`);
  });

  test("format literal", () => {
    qweb.addTemplate("test", `<div t-attf-foo="bar"/>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div foo="bar"></div>`);
  });

  test("t-attf-class should combine with class", () => {
    qweb.addTemplate("test", `<div class="hello" t-attf-class="world"/>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div class="hello world"></div>`);
  });

  test("format value", () => {
    qweb.addTemplate("test", `<div t-attf-foo="b{{value}}r"/>`);
    const result = renderToString(qweb, "test", { value: "a" });
    expect(result).toBe(`<div foo="bar"></div>`);
  });

  test("from variables set previously", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-set="abc" t-value="'def'"/><span t-att-class="abc"/></div>`
    );
    const result = renderToString(qweb, "test");
    expect(result).toBe('<div><span class="def"></span></div>');
  });

  test("from object variables set previously", () => {
    // Note: standard qweb does not allow this...
    qweb.addTemplate(
      "test",
      `<div><t t-set="o" t-value="{a:'b'}"/><span t-att-class="o.a"/></div>`
    );
    const result = renderToString(qweb, "test");
    expect(result).toBe('<div><span class="b"></span></div>');
  });

  test("format expression", () => {
    qweb.addTemplate("test", `<div t-attf-foo="{{value + 37}}"/>`);
    const result = renderToString(qweb, "test", { value: 5 });
    expect(result).toBe(`<div foo="42"></div>`);
  });

  test("format multiple", () => {
    qweb.addTemplate(
      "test",
      `<div t-attf-foo="a {{value1}} is {{value2}} of {{value3}} ]"/>`
    );
    const result = renderToString(qweb, "test", {
      value1: 0,
      value2: 1,
      value3: 2
    });
    expect(result).toBe(`<div foo="a 0 is 1 of 2 ]"></div>`);
  });

  test.skip("various escapes", () => {
    // not needed??
    qweb.addTemplate(
      "test",
      `
         <div foo="&lt;foo"
            t-att-bar="bar"
            t-attf-baz="&lt;{{baz}}&gt;"
            t-att="qux"/>
        `
    );
    const result = renderToString(qweb, "test", {
      bar: 0,
      baz: 1,
      qux: { qux: "<>" }
    });
    const expected = `<div foo="&lt;foo" bar="&lt;bar&gt;" baz="&lt;&quot;&lt;baz&gt;&quot;&gt;" qux="&lt;&gt;"></div>`;
    expect(result).toBe(expected);
  });

  test("t-att-class and class should combine together", () => {
    qweb.addTemplate("test", `<div class="hello" t-att-class="value"/>`);
    const result = renderToString(qweb, "test", { value: "world" });
    expect(result).toBe(`<div class="hello world"></div>`);
  });

  test("t-att-class with object", () => {
    qweb.addTemplate(
      "test",
      `<div class="static" t-att-class="{a: b, c: d, e: f}"/>`
    );
    const result = renderToString(qweb, "test", { b: true, d: false, f: true });
    expect(result).toBe(`<div class="static a e"></div>`);
  });
});

describe("t-call (template calling", () => {
  test("basic caller", () => {
    qweb.addTemplate("_basic-callee", "<div>ok</div>");
    qweb.addTemplate("caller", '<t t-call="_basic-callee"/>');
    const expected = "<div>ok</div>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("t-call not allowed on a non t node", () => {
    qweb.addTemplate("_basic-callee", "<t>ok</t>");
    qweb.addTemplate("caller", '<div t-call="_basic-callee"/>');
    expect(() => renderToString(qweb, "caller")).toThrow("Invalid tag");
  });

  test("with unused body", () => {
    qweb.addTemplate("_basic-callee", "<div>ok</div>");
    qweb.addTemplate("caller", '<t t-call="_basic-callee">WHEEE</t>');
    const expected = "<div>ok</div>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("with unused setbody", () => {
    qweb.addTemplate("_basic-callee", "<div>ok</div>");
    qweb.addTemplate(
      "caller",
      '<t t-call="_basic-callee"><t t-set="qux" t-value="3"/></t>'
    );
    const expected = "<div>ok</div>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("with used body", () => {
    qweb.addTemplate("_callee-printsbody", '<h1><t t-esc="0"/></h1>');
    qweb.addTemplate("caller", '<t t-call="_callee-printsbody">ok</t>');
    const expected = "<h1>ok</h1>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("with used set body", () => {
    qweb.addTemplate("_callee-uses-foo", '<t t-esc="foo"/>');
    qweb.addTemplate(
      "caller",
      `
        <span><t t-call="_callee-uses-foo"><t t-set="foo" t-value="'ok'"/></t></span>`
    );
    const expected = "<span>ok</span>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("inherit context", () => {
    qweb.addTemplate("_callee-uses-foo", '<t t-esc="foo"/>');
    qweb.addTemplate(
      "caller",
      `
        <div><t t-set="foo" t-value="1"/><t t-call="_callee-uses-foo"/></div>`
    );
    const expected = "<div>1</div>";
    expect(renderToString(qweb, "caller")).toBe(expected);
  });

  test("scoped parameters", () => {
    qweb.addTemplate("_basic-callee", `<t>ok</t>`);
    qweb.addTemplate(
      "caller",
      `
        <div>
            <t t-call="_basic-callee">
                <t t-set="foo" t-value="42"/>
            </t>
            <t t-esc="foo"/>
        </div>
      `
    );
    const expected = "<div>ok</div>";
    expect(trim(renderToString(qweb, "caller"))).toBe(expected);
  });
});

describe("foreach", () => {
  test("iterate on items", () => {
    qweb.addTemplate(
      "test",
      `
      <div>
        <t t-foreach="[3, 2, 1]" t-as="item">
          [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]
        </t>
    </div>`
    );
    const result = trim(renderToString(qweb, "test"));
    const expected = `<div>[0:33][1:22][2:11]</div>`;
    expect(result).toBe(expected);
  });

  test("iterate on items (on a element node)", () => {
    qweb.addTemplate(
      "test",
      `
      <div>
        <span t-foreach="[1, 2]" t-as="item" t-key="item"><t t-esc="item"/></span>
    </div>`
    );
    const result = trim(renderToString(qweb, "test"));
    const expected = `<div><span>1</span><span>2</span></div>`;
    expect(result).toBe(expected);
  });

  test("iterate, position", () => {
    qweb.addTemplate(
      "test",
      `
      <div>
        <t t-foreach="5" t-as="elem">
          -<t t-if="elem_first"> first</t><t t-if="elem_last"> last</t> (<t t-esc="elem_parity"/>)
        </t>
      </div>`
    );
    const result = trim(renderToString(qweb, "test"));
    const expected = `<div>-first(even)-(odd)-(even)-(odd)-last(even)</div>`;
    expect(result).toBe(expected);
  });

  test("iterate, integer param", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-foreach="3" t-as="item">
        [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/>]
      </t></div>`
    );
    const result = trim(renderToString(qweb, "test"));
    const expected = `<div>[0:00][1:11][2:22]</div>`;
    expect(result).toBe(expected);
  });

  test("iterate, dict param", () => {
    qweb.addTemplate(
      "test",
      `
      <div>
        <t t-foreach="value" t-as="item">
          [<t t-esc="item_index"/>: <t t-esc="item"/> <t t-esc="item_value"/> - <t t-esc="item_parity"/>]
        </t>
      </div>`
    );
    const result = trim(
      renderToString(qweb, "test", { value: { a: 1, b: 2, c: 3 } })
    );
    const expected = `<div>[0:a1-even][1:b2-odd][2:c3-even]</div>`;
    expect(result).toBe(expected);
  });

  test("does not pollute the rendering context", () => {
    qweb.addTemplate(
      "test",
      `<div>
        <t t-foreach="[1]" t-as="item"><t t-esc="item"/></t>
      </div>`
    );
    const context = {};
    renderToString(qweb, "test", context);
    expect(Object.keys(context).length).toBe(0);
  });

  test("throws error if invalid loop expression", () => {
    qweb.addTemplate(
      "test",
      `<div><t t-foreach="abc" t-as="item"><span t-key="item_index"/></t></div>`
    );
    expect(() => qweb.render("test")).toThrow("Invalid loop expression");
  });

  test("warn if no key in some case", () => {
    const consoleWarn = console.warn;
    console.warn = jest.fn();

    qweb.addTemplate(
      "test",
      `
      <div>
        <t t-foreach="[1, 2]" t-as="item">
          <span><t t-esc="item"/></span>
        </t>
    </div>`
    );
    renderToString(qweb, "test");
    expect(console.warn).toHaveBeenCalledTimes(1);
    console.warn = consoleWarn;
  });

});

describe("misc", () => {
  test("global", () => {
    qweb.addTemplate("_callee-asc", `<Año t-att-falló="'agüero'" t-raw="0"/>`);
    qweb.addTemplate(
      "_callee-uses-foo",
      `<span t-esc="foo">foo default</span>`
    );
    qweb.addTemplate(
      "_callee-asc-toto",
      `<div t-raw="toto">toto default</div>`
    );
    qweb.addTemplate(
      "caller",
      `
      <div>
        <t t-foreach="[4,5,6]" t-as="value">
          <span t-esc="value"/>
          <t t-call="_callee-asc">
            <t t-call="_callee-uses-foo">
                <t t-set="foo" t-value="'aaa'"/>
            </t>
            <t t-call="_callee-uses-foo"/>
            <t t-set="foo" t-value="'bbb'"/>
            <t t-call="_callee-uses-foo"/>
          </t>
        </t>
        <t t-call="_callee-asc-toto"/>
      </div>
    `
    );
    const result = trim(renderToString(qweb, "caller"));
    const expected = trim(`
      <div>
        <span>4</span>
        <año falló="agüero">
          <span>aaa</span>
          <span>foo default</span>
          <span>bbb</span>
        </año>

        <span>5</span>
        <año falló="agüero">
          <span>aaa</span>
          <span>foo default</span>
          <span>bbb</span>
        </año>

        <span>6</span>
        <año falló="agüero">
          <span>aaa</span>
          <span>foo default</span>
          <span>bbb</span>
        </año>

        <div>toto default</div>
      </div>
    `);
    expect(result).toBe(expected);
  });
});

describe("t-on", () => {
  test("can bind event handler", () => {
    qweb.addTemplate("test", `<button t-on-click="add">Click</button>`);
    let a = 1;
    const node = renderToDOM(
      qweb,
      "test",
      {
        add() {
          a = 3;
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).click();
    expect(a).toBe(3);
  });

  test("can bind two event handlers", () => {
    qweb.addTemplate(
      "test",
      `<button t-on-click="handleClick" t-on-dblclick="handleDblClick">Click</button>`
    );
    let steps: string[] = [];
    const node = renderToDOM(
      qweb,
      "test",
      {
        handleClick() {
          steps.push("click");
        },
        handleDblClick() {
          steps.push("dblclick");
        }
      },
      { handlers: [] }
    );
    expect(steps).toEqual([]);
    (<HTMLElement>node).click();
    expect(steps).toEqual(["click"]);
    (<HTMLElement>node).dispatchEvent(new Event("dblclick"));
    expect(steps).toEqual(["click", "dblclick"]);
  });

  test("can bind handlers with arguments", () => {
    qweb.addTemplate("test", `<button t-on-click="add(5)">Click</button>`);
    let a = 1;
    const node = renderToDOM(
      qweb,
      "test",
      {
        add(n) {
          a = a + n;
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).click();
    expect(a).toBe(6);
  });

  test("can bind handlers with object arguments", () => {
    qweb.addTemplate(
      "test",
      `<button t-on-click="add({val: 5})">Click</button>`
    );
    let a = 1;
    const node = renderToDOM(
      qweb,
      "test",
      {
        add({ val }) {
          a = a + val;
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).click();
    expect(a).toBe(6);
  });

  test("can bind handlers with empty object", () => {
    expect.assertions(2);
    qweb.addTemplate(
      "test",
      `<button t-on-click="doSomething({})">Click</button>`
    );
    const node = renderToDOM(
      qweb,
      "test",
      {
        doSomething(arg) {
          expect(arg).toEqual({});
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).click();
  });

  test("can bind handlers with empty object (with non empty inner string", () => {
    expect.assertions(2);
    qweb.addTemplate(
      "test",
      `<button t-on-click="doSomething({ })">Click</button>`
    );
    const node = renderToDOM(
      qweb,
      "test",
      {
        doSomething(arg) {
          expect(arg).toEqual({});
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).click();
  });

  test("can bind handlers with loop variable as argument", () => {
    expect.assertions(2);
    qweb.addTemplate(
      "test",
      `
      <ul>
        <li t-foreach="['someval']" t-as="action" t-key="action_index"><a t-on-click="activate(action)">link</a></li>
      </ul>`
    );
    const node = renderToDOM(
      qweb,
      "test",
      {
        activate(action) {
          expect(action).toBe("someval");
        }
      },
      { handlers: [] }
    );
    (<HTMLElement>node).getElementsByTagName("a")[0].click();
  });

  test("handler is bound to proper owner", () => {
    expect.assertions(2);
    qweb.addTemplate("test", `<button t-on-click="add">Click</button>`);
    let owner = {
      add() {
        expect(this).toBe(owner);
      }
    };
    const node = renderToDOM(qweb, "test", owner, { handlers: [] });
    (<HTMLElement>node).click();
  });
});

describe("t-ref", () => {
  test("can get a ref on a node", () => {
    qweb.addTemplate("test", `<div><span t-ref="'myspan'"/></div>`);
    let refs: any = {};
    renderToDOM(qweb, "test", { refs });
    expect(refs.myspan.tagName).toBe("SPAN");
  });

  test("can get a dynamic ref on a node", () => {
    qweb.addTemplate("test", `<div><span t-ref="'myspan' + 3"/></div>`);
    let refs: any = {};
    renderToDOM(qweb, "test", { refs });
    expect(refs.myspan3.tagName).toBe("SPAN");
  });

  test("refs in a loop", () => {
    qweb.addTemplate("test", `
      <div>
        <t t-foreach="items" t-as="item">
          <div t-ref="item" t-key="item"><t t-esc="item"/></div>
        </t>
      </div>`);
    let refs: any = {};
    renderToDOM(qweb, "test", { refs, items: [1,2,3] });
    expect(Object.keys(refs)).toEqual(["1", "2", "3"]);
  });
});

describe("loading templates", () => {
  test("can initialize qweb with a string", () => {
    const data = `
      <?xml version="1.0" encoding="UTF-8"?>
      <templates id="template" xml:space="preserve">
        <div t-name="hey">jupiler</div>
      </templates>`;
    const qweb = new QWeb(data);
    expect(renderToString(qweb, "hey")).toBe("<div>jupiler</div>");
  });

  test("can load a few templates from a xml string", () => {
    const data = `
      <?xml version="1.0" encoding="UTF-8"?>
      <templates id="template" xml:space="preserve">

        <t t-name="items"><li>ok</li><li>foo</li></t>

        <ul t-name="main"><t t-call="items"/></ul>
      </templates>`;
    qweb.loadTemplates(data);
    const result = renderToString(qweb, "main");
    expect(result).toBe("<ul><li>ok</li><li>foo</li></ul>");
  });

  test("does not crash if string does not have templates", () => {
    const data = "";
    qweb.loadTemplates(data);
    expect(qweb.templates).toEqual({});
  });
});

describe("special cases for some boolean html attributes/properties", () => {
  test("input type= checkbox, with t-att-checked", () => {
    qweb.addTemplate("test", `<input type="checkbox" t-att-checked="flag"/>`);
    const result = renderToString(qweb, "test", { flag: true });
    expect(result).toBe(`<input type="checkbox" checked="">`);
  });

  test("various boolean html attributes", () => {
    // the unique assertion here is the code snapshot automatically done by
    // renderToString
    expect.assertions(1);
    qweb.addTemplate(
      "test",
      `
      <div>
        <input type="checkbox" checked="checked"/>
        <input checked="checked"/>
        <div checked="checked"/>
        <div selected="selected"/>
        <option selected="selected" other="1"/>
        <input readonly="readonly"/>
        <button disabled="disabled"/>
      </div>
      `
    );
    renderToString(qweb, "test", { flag: true });
  });
});

describe("whitespace handling", () => {
  test("white space only text nodes are condensed into a single space", () => {
    qweb.addTemplate("test", `<div>  </div>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div> </div>`);
  });

  test("consecutives whitespaces are condensed into a single space", () => {
    qweb.addTemplate("test", `<div>  abc  </div>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div> abc </div>`);
  });

  test("whitespace only text nodes with newlines are removed", () => {
    qweb.addTemplate(
      "test",
      `<div>
        <span>abc</span>
       </div>`
    );
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<div><span>abc</span></div>`);
  });

  test("nothing is done in pre tags", () => {
    qweb.addTemplate("test", `<pre>  </pre>`);
    const result = renderToString(qweb, "test");
    expect(result).toBe(`<pre>  </pre>`);

    const pretagtext = `<pre>
        some text
      </pre>`;
    qweb.addTemplate("test2", pretagtext);
    const result2 = renderToString(qweb, "test2");
    expect(result2).toBe(pretagtext);

    const pretagwithonlywhitespace = `<pre>
        
      </pre>`;
    qweb.addTemplate("test3", pretagwithonlywhitespace);
    const result3 = renderToString(qweb, "test3");
    expect(result3).toBe(pretagwithonlywhitespace);
  });
});

describe("t-key", () => {
  test("can use t-key directive on a node", () => {
    qweb.addTemplate(
      "test",
      `<div t-key="beer.id"><t t-esc="beer.name"/></div>`
    );
    expect(
      renderToString(qweb, "test", { beer: { id: 12, name: "Chimay Rouge" } })
    ).toBe("<div>Chimay Rouge</div>");
  });

  test("t-key directive in a list", () => {
    qweb.addTemplate(
      "test",
      `<ul>
        <li t-foreach="beers" t-as="beer" t-key="beer.id"><t t-esc="beer.name"/></li>
       </ul>`
    );
    expect(
      renderToString(qweb, "test", {
        beers: [{ id: 12, name: "Chimay Rouge" }]
      })
    ).toMatchSnapshot();
  });
});

describe("debugging", () => {
  test("t-debug", () => {
    const consoleLog = console.log;
    console.log = jest.fn();
    qweb.addTemplate(
      "test",
      `<div t-debug="1"><t t-if="true"><span t-debug="1">hey</span></t></div>`
    );
    qweb.render("test");
    expect(qweb.templates.test.fn.toString()).toMatchSnapshot();

    expect(console.log).toHaveBeenCalledTimes(1);
    console.log = consoleLog;
  });

  test("t-log", () => {
    const consoleLog = console.log;
    console.log = jest.fn();

    qweb.addTemplate(
      "test",
      `<div>
          <t t-set="foo" t-value="42"/>
          <t t-log="foo + 3"/>
        </div>`
    );
    qweb.render("test");
    expect(qweb.templates.test.fn.toString()).toMatchSnapshot();

    expect(console.log).toHaveBeenCalledWith(45);
    console.log = consoleLog;
  });
});

describe("animations", () => {
  test("t-transition, on a simple node", async () => {
    // this test does not test much, because it is not easy to test timing
    // transitions... we should do a little more effort for these tests.
    qweb.addTemplate(
      "test",
      `<div><span t-transition="chimay">blue</span></div>`
    );
    let dom: HTMLElement = <HTMLElement>renderToDOM(qweb, "test");
    expect(dom.innerHTML).toMatchSnapshot();
  });
});