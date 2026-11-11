import "./styles/base.css";
import * as home from "./features/home/home.js";
import * as notFound from "./features/not-found/not-found.js";
import { start } from "./shared/router.js";

start(document.querySelector("#root"), { "/": home, "*": notFound });
