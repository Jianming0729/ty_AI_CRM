const { decrypt } = require('@wecom/crypto');

const aesKey = 'uWbL5cea2greKh18Uqt8cIRBied4ev5dsB1O3WQxC1d=';
const suiteId = 'ww972d876dc8de53b4';
const payload = 'KvsuD88JhLu7H9BjIWSqjN0sg0rT4PqsIOL9fRbRDWH4EAA/hWELbOr3MPyiQMqJK4ARwpnv4y6pZqL1oqdxbgxIJkVEDUMHla9mcxiTpjZxTr/6Ya2XTSQJh0qGzMInPOf407O7QhX2mS5n8oKzDntrP8XqDWh6N7vUDWPnpp4XK/oQF+ofsjl0rJVHF4I1WaM1gFvowLPKxbUrSUzbC76p5m8XqDWh6N7vUDWPnpp4XK/oQF+ofsjl0rJVHF4I1WaM1gFvowLPKxbUrSUz';

try {
    console.log('--- Mode A: With SuiteID ---');
    const resA = decrypt(aesKey, payload, suiteId);
    console.log('Result A ID:', resA.id);
    console.log('Result A Message:', resA.message.toString());
} catch (e) {
    console.log('Mode A Error:', e.message);
}

try {
    console.log('\n--- Mode B: Without ID ---');
    const resB = decrypt(aesKey, payload);
    console.log('Result B ID:', resB.id);
    console.log('Result B Message Hex:', resB.message.slice(0, 32).toString('hex'));
    console.log('Result B Message Text:', resB.message.toString());
} catch (e) {
    console.log('Mode B Error:', e.message);
}
