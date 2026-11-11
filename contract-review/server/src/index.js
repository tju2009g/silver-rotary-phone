import { handle } from "./app.js";

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx)
};
