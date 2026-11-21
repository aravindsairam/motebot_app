import { parseAddress } from './address';

describe('parseAddress', () => {
  it.each([
    ['192.168.0.102', 'ws://192.168.0.102:9090', '192.168.0.102'],
    ['  192.168.0.102  ', 'ws://192.168.0.102:9090', '192.168.0.102'],
    ['192.168.0.102:9091', 'ws://192.168.0.102:9091', '192.168.0.102:9091'],
    ['ws://10.0.2.2:9090/', 'ws://10.0.2.2:9090', '10.0.2.2'],
    ['mypc.local', 'ws://mypc.local:9090', 'mypc.local'],
  ])('accepts %s', (text, url, label) => {
    expect(parseAddress(text)).toEqual({ url, label });
  });

  it.each([
    ['', /Type the PC's address/],
    ['http://192.168.0.102', /without http/],
    ['192.168.0.102:99999', /not a port number/],
    ['192.168.0.102:abc', /not a port number/],
    ['fe80::1', /IPv6/],
    ['my pc', /not an address/],
    ['-pc', /not an address/],
  ])('refuses %j', (text, message) => {
    const result = parseAddress(text);
    expect('error' in result && result.error).toMatch(message);
  });
});
