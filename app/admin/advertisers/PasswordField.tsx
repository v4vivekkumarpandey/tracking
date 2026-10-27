'use client';

import { useState } from 'react';

const CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('');
}

/** Password input with show/hide and a generator, for the add-advertiser form. */
export function PasswordField({ min }: { min: number }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  return (
    <label>Password
      <span className="input-addons">
        <input name="password" type={show ? 'text' : 'password'} value={value} onChange={(e) => setValue(e.target.value)}
          minLength={min} autoComplete="new-password" placeholder="Leave empty to create the login later" />
        <button type="button" className="secondary small" onClick={() => { setValue(generate()); setShow(true); }}>Generate</button>
        <button type="button" className="secondary small" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
      </span>
    </label>
  );
}
