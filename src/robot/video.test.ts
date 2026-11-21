jest.mock('react-native-webrtc', () => ({}));

import { offerUrl } from './video';

describe('the video address', () => {
  it('is on the gateway PC, port 8080', () => {
    expect(offerUrl('10.0.2.2')).toBe('http://10.0.2.2:8080/offer');
    expect(offerUrl('192.168.0.102:9091')).toBe('http://192.168.0.102:8080/offer');
    expect(offerUrl('mypc.local')).toBe('http://mypc.local:8080/offer');
    expect(offerUrl('ws://x/y')).toBeNull();
  });
});
