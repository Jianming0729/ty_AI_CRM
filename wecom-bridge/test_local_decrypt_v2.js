const { decrypt } = require('@wecom/crypto');

const aesKey = 'uWbL5cea2greKh18Uqt8cIRBied4ev5dsB1O3WQxC1d=';
const suiteId = 'ww972d876dc8de53b4';
// CORRECT PAYLOAD (I'll try to reconstruct the unique part if it was corrupted in log)
// Wait, let's use the one from the log first. If it was interleaved, it might still fail.
const payload = 'KvsuD88JhLu7H9BjIWSqjN0sg0rT4PqsIOL9fRbRDWH4EAA/hWELbOr3MPyiQMqJK4ARwpnv4y6pZqL1oqdxbgxIJkVEDUMHla9mcxiTpjZxTr/6Ya2XTSQJh0qGzMInPOf407O7QhX2mS5n8oKzDntrP8XqDWh6N7vUDWPnpp4XK/oQF+ofsjl0rJVHF4I1WaM1gFvowLPKxbUrSUzbC76p5m8XqDWh6N7vUDWPnpp4XK/oQF+ofsjl0rJVHF4I1WaM1gFvowLPKxbUrSUz';

try {
    const res = decrypt(aesKey, payload, suiteId);
    console.log('Decryption SUCCESS!');
    console.log('ID:', res.id);
    console.log('Message:', res.message.toString());
} catch (e) {
    console.log('Decryption Failed:', e.message);
}
