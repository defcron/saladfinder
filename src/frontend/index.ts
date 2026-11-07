import { frontend } from "../server/frontend";

type FrontendEnv = { ASSETS: Fetcher };

export default {
  fetch(request: Request, env: FrontendEnv): Promise<Response> {
    return frontend(request, env);
  },
} satisfies ExportedHandler<FrontendEnv>;
