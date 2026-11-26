import "./styles/base.css";
import "./styles/tokens.css";
import * as signin from "./features/auth/signin.js";
import * as signup from "./features/auth/signup.js";
import * as landing from "./features/landing/landing.js";
import * as notFound from "./features/not-found/not-found.js";
import { recordsWorkspaceView } from "./features/records-workspace/view.js";
import { start } from "./shared/router.js";

start(document.querySelector("#root"), {
    "/": landing,
    "/signin": signin,
    "/signup": signup,
    "/records": recordsWorkspaceView,
    "*": notFound,
});
