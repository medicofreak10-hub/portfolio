// Evening summary email via Gmail SMTP (App Password from .env).
import nodemailer from 'nodemailer';
import { config } from './config.js';
import * as store from './lib/store.js';
import { inr, pct, arrow } from './lib/format.js';

export function emailConfigured() { return !!(config.gmailUser && config.gmailPass && config.emailTo); }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const col = (n) => (n > 0 ? '#0a7d0a' : n < 0 ? '#c62828' : '#666');

export function renderSummary({ portfolio, summary, mood, news, alerts }) {
  const t = portfolio.total;
  const rows = portfolio.rows.filter((r) => r.type !== 'mf').sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).map((r) => `
    <tr><td style="padding:6px 8px">${esc(r.name)}</td><td style="padding:6px 8px;text-align:right">${inr(r.price, 2)}</td>
    <td style="padding:6px 8px;text-align:right;color:${col(r.changePct)}">${arrow(r.changePct)} ${pct(r.changePct)}</td>
    <td style="padding:6px 8px;text-align:right;color:${col(r.pnl)}">${inr(r.pnl)}</td></tr>`).join('');
  const nl = (news || []).slice(0, 6).map((n) => `<li style="margin:4px 0"><a href="${esc(n.url)}">${esc(n.title)}</a> <span style="color:#888">— ${esc(n.source)} · ${esc(n.sentiment)}</span></li>`).join('');
  const al = (alerts || []).slice(0, 10).map((a) => `<li>${esc(a.title)} — ${esc(a.body)}</li>`).join('');
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:auto;color:#111">
  <h2 style="margin:0 0 4px">My Halal Portfolio — evening summary</h2>
  <div style="color:#666;font-size:13px">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })} IST</div>
  <p style="font-size:16px">${esc(summary.text)}</p>
  <table style="width:100%;border-collapse:collapse;margin:8px 0;background:#f7f7f5;border-radius:8px">
   <tr><td style="padding:10px">Total value<br><b style="font-size:20px">${inr(t.value)}</b></td>
   <td style="padding:10px">Today<br><b style="font-size:20px;color:${col(t.dayChange)}">${arrow(t.dayChange)} ${inr(t.dayChange)} (${pct(t.dayChangePct)})</b></td>
   <td style="padding:10px">Total P&amp;L<br><b style="font-size:20px;color:${col(t.pnl)}">${inr(t.pnl)} (${pct(t.pnlPct)})</b></td></tr></table>
  ${mood ? `<p>${esc(mood.label)}: <b>${mood.value}</b> — ${esc(mood.zoneLabel)}. ${esc(mood.tip)}</p>` : ''}
  <h3>Stocks &amp; ETFs</h3><table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="color:#666"><th align="left">Name</th><th align="right">Price</th><th align="right">Today</th><th align="right">P&amp;L</th></tr>${rows}</table>
  ${al ? `<h3>Alerts today</h3><ul>${al}</ul>` : ''}
  ${nl ? `<h3>News to read</h3><ul style="padding-left:18px">${nl}</ul>` : ''}
  <p style="color:#888;font-size:12px">Read-only tracker. Scores and entry zones are technical guides only, not investment advice. Shariah status is screened by the app — verify with a qualified scholar.</p>
  </body></html>`;
}

export async function sendSummary(payload) {
  if (!emailConfigured()) throw new Error('Email not configured: set GMAIL_USER, GMAIL_APP_PASSWORD and EMAIL_TO in .env');
  const tx = nodemailer.createTransport({ service: 'gmail', auth: { user: config.gmailUser, pass: config.gmailPass } });
  const t = payload.portfolio.total;
  const subject = `Portfolio ${t.dayChange >= 0 ? '▲ up' : '▼ down'} ${inr(Math.abs(t.dayChange))} (${pct(t.dayChangePct)}) — ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
  await tx.sendMail({ from: `My Halal Portfolio <${config.gmailUser}>`, to: config.emailTo, subject, html: renderSummary(payload) });
  store.get().lastEmailDate = new Date().toISOString().slice(0, 10);
  store.save();
}
