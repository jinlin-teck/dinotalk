import { lookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent } from "undici";
import { isBlockedEndpointAddress, validateEndpointUrl } from "./endpoint-guard";

function createProviderAgent(blockPrivate: boolean): Agent {
  const lookupAllowedAddress: LookupFunction = (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "");
        return;
      }

      const allowed = addresses.filter(({ address }) => !isBlockedEndpointAddress(address, blockPrivate));
      if (allowed.length === 0) {
        callback(new Error("接口解析地址不符合出站策略"), "");
        return;
      }

      // Hand the checked addresses to the socket so it cannot resolve the host again.
      if (options.all) {
        callback(null, allowed);
      } else {
        callback(null, allowed[0].address, allowed[0].family);
      }
    });
  };

  return new Agent({ connect: { lookup: lookupAllowedAddress } });
}

const lanProviderAgent = createProviderAgent(false);
const publicProviderAgent = createProviderAgent(true);

export async function fetchProviderEndpoint(url: string, init: RequestInit): Promise<Response> {
  const check = validateEndpointUrl(url);
  if (!check.ok) throw new Error(check.error);

  const options: RequestInit & { dispatcher: Agent } = {
    ...init,
    cache: "no-store",
    redirect: "error",
    dispatcher: process.env.BLOCK_PRIVATE_ENDPOINTS === "1" ? publicProviderAgent : lanProviderAgent,
  };
  return fetch(check.normalized, options);
}
