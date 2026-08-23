import { render } from "preact";
import "@family-tools/ui/styles.css";
import "./app.css";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
