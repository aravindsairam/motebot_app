// The PC's address as typed by the user: "192.168.0.102", "192.168.0.102:9090", "mypc.local",
// or with "ws://" in front.

export const DEFAULT_PORT = 9090;

export interface GatewayAddress {
  url: string; // ws://host:port
  label: string; // what the user sees: host, plus the port when it is not the usual one
}

export function parseAddress(text: string): GatewayAddress | { error: string } {
  let rest = text.trim().replace(/^ws:\/\//i, '').replace(/\/+$/, '');
  if (!rest) return { error: "Type the PC's address, for example 192.168.0.102." };
  if (/^[a-z]+:\/\//i.test(rest)) return { error: 'Type only the address, without http:// or similar.' };
  if ((rest.match(/:/g) ?? []).length > 1) return { error: 'IPv6 addresses are not supported; use the IPv4 address.' };

  let port = DEFAULT_PORT;
  const colon = rest.indexOf(':');
  if (colon >= 0) {
    const portText = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
    if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
      return { error: `"${portText}" is not a port number (1 to 65535).` };
    }
    port = Number(portText);
  }
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(rest)) {
    return { error: `"${rest}" is not an address. Use digits and dots, like 192.168.0.102, or a name.` };
  }
  return { url: `ws://${rest}:${port}`, label: port === DEFAULT_PORT ? rest : `${rest}:${port}` };
}
