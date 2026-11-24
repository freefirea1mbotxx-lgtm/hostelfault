const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'database_v3.json');

// Alphanumeric authorization key required for Senate registration
const SENATE_SIGNUP_KEY = 'SENATE-AUTH-9X7K2M4P8Q1Z';

function nowStamp() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const t = nowStamp();
    const initialData = {
      users: [
        { id: 'u1', role: 'student', matric: 'CSC/2022/041', hostel: 'Female Hostel 4', block: 3, room: 14, password: '123' },
        { id: 'u2', role: 'student', matric: 'ENG/2021/019', hostel: 'Male Hostel 4', block: 7, room: 9, password: '123' },
        { id: 'u3', role: 'senate', staffId: 'SEN-001', name: 'Dr. Adebayo', password: '123' },
        { id: 'u4', role: 'works', staffId: 'WRK-001', name: 'Engr. Okafor', password: '123' }
      ],
      faults: [
        {
          id: 'FLT-1001',
          hostel: 'Female Hostel 4',
          block: 3,
          room: 14,
          type: 'socket',
          color: 'green',
          description: '13A wall socket sparking near study desk',
          reportedBy: 'CSC/2022/041',
          status: 'in_progress',
          priority: true,
          x: 185,
          y: 382,
          steps: [
            { title: 'Fault Reported', actor: 'Student (CSC/2022/041)', detail: 'Submitted socket fault for FH4 Block 3, Room 14.', time: t },
            { title: 'Senate Escalation', actor: 'Senate (Dr. Adebayo)', detail: 'Marked HIGH PRIORITY due to electrical sparking hazard.', time: t },
            { title: 'Technician Dispatched', actor: 'Works Dept (Engr. Okafor)', detail: 'Electrical unit assigned to inspect circuit breaker.', time: t }
          ]
        },
        {
          id: 'FLT-1002',
          hostel: 'Female Hostel 4',
          block: 3,
          room: 12,
          type: 'fan',
          color: 'yellow',
          description: 'Ceiling fan wobbling at high speed',
          reportedBy: 'BIO/2023/112',
          status: 'open',
          priority: false,
          x: 192,
          y: 390,
          steps: [
            { title: 'Fault Reported', actor: 'Student (BIO/2023/112)', detail: 'Submitted ceiling fan fault for FH4 Block 3, Room 12.', time: t }
          ]
        },
        {
          id: 'FLT-1003',
          hostel: 'Female Hostel 4',
          block: 3,
          room: 15,
          type: 'locker',
          color: 'pink',
          description: 'Steel wardrobe locker hinge detached',
          reportedBy: 'CHM/2022/089',
          status: 'open',
          priority: false,
          x: 178,
          y: 388,
          steps: [
            { title: 'Fault Reported', actor: 'Student (CHM/2022/089)', detail: 'Submitted locker fault for FH4 Block 3, Room 15.', time: t }
          ]
        },
        {
          id: 'FLT-1004',
          hostel: 'Male Hostel 4',
          block: 7,
          room: 9,
          type: 'fan',
          color: 'yellow',
          description: 'Fan regulator switch unresponsive',
          reportedBy: 'ENG/2021/019',
          status: 'open',
          priority: false,
          x: 615,
          y: 448,
          steps: [
            { title: 'Fault Reported', actor: 'Student (ENG/2021/019)', detail: 'Submitted fan fault for MH4 Block 7, Room 9.', time: t }
          ]
        },
        {
          id: 'FLT-1005',
          hostel: 'Male Hostel 2',
          block: null,
          room: 8,
          type: 'socket',
          color: 'green',
          description: 'Wall outlet burnt out near entrance',
          reportedBy: 'PHY/2022/011',
          status: 'open',
          priority: false,
          x: 680,
          y: 135,
          steps: [
            { title: 'Fault Reported', actor: 'Student (PHY/2022/011)', detail: 'Submitted socket fault for Male Hostel 2, Room 8.', time: t }
          ]
        }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function sendJSON(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '').trim();
        if (!raw) return resolve({});
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('JSON parse error: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function hasBlocks(hostel) {
  return hostel === 'Female Hostel 4' || hostel === 'Male Hostel 4';
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  try {
    // Public Role Counts (No fault data exposed without authentication)
    if (url === '/api/meta' && req.method === 'GET') {
      const db = loadDB();
      return sendJSON(res, 200, {
        counts: {
          senate: db.users.filter(u => u.role === 'senate').length,
          works: db.users.filter(u => u.role === 'works').length
        }
      });
    }

    // Authenticated State Endpoint
    if (url === '/api/state' && req.method === 'POST') {
      const { userId, role } = await parseBody(req);
      const db = loadDB();
      const isMod = role === 'moderator' && userId === 'mod_001';
      const validUser = isMod || db.users.some(u => u.id === userId && u.role === role);

      if (!validUser) {
        return sendJSON(res, 401, { error: 'Unauthorized: Sign in to view complaint records.' });
      }

      return sendJSON(res, 200, {
        faults: db.faults,
        users: isMod ? db.users.map(u => ({ ...u, password: '***' })) : undefined,
        counts: {
          senate: db.users.filter(u => u.role === 'senate').length,
          works: db.users.filter(u => u.role === 'works').length
        }
      });
    }

    // Sign Up (Blocks moderator creation; requires alphanumeric key for Senate)
    if (url === '/api/auth/signup' && req.method === 'POST') {
      const db = loadDB();
      const { role, matric, staffId, senateKey, name, hostel, block, room, password } = await parseBody(req);

      if (role === 'moderator' || (matric || '').trim() === '001') {
        return sendJSON(res, 403, { error: 'Moderator accounts cannot be registered via sign up.' });
      }

      if (role === 'senate') {
        if ((senateKey || '').trim() !== SENATE_SIGNUP_KEY) {
          return sendJSON(res, 403, { error: 'Invalid Senate Authorization Key. Registration denied.' });
        }
        if (db.users.filter(u => u.role === 'senate').length >= 5) {
          return sendJSON(res, 403, { error: 'Account cap reached: Maximum 5 Senate accounts allowed.' });
        }
        if (!staffId || db.users.some(u => (u.staffId || '').toLowerCase() === staffId.toLowerCase())) {
          return sendJSON(res, 400, { error: 'Staff ID missing or already registered.' });
        }
      } else if (role === 'works') {
        if (db.users.filter(u => u.role === 'works').length >= 5) {
          return sendJSON(res, 403, { error: 'Account cap reached: Maximum 5 Works Department accounts allowed.' });
        }
        if (!staffId || db.users.some(u => (u.staffId || '').toLowerCase() === staffId.toLowerCase())) {
          return sendJSON(res, 400, { error: 'Staff ID missing or already registered.' });
        }
      } else if (role === 'student') {
        if (!matric || db.users.some(u => (u.matric || '').toLowerCase() === matric.toLowerCase())) {
          return sendJSON(res, 400, { error: 'Matric number missing or already registered.' });
        }
        const rm = Number(room);
        if (!rm || rm < 1 || rm > 25) {
          return sendJSON(res, 400, { error: 'Room number must be between 1 and 25.' });
        }
        if (hasBlocks(hostel)) {
          const blk = Number(block);
          if (!blk || blk < 1 || blk > 10) {
            return sendJSON(res, 400, { error: 'Block number for FH4/MH4 must be between 1 and 10.' });
          }
        }
      } else {
        return sendJSON(res, 400, { error: 'Invalid role selected.' });
      }

      const newUser = {
        id: 'u_' + Date.now(),
        role,
        matric: role === 'student' ? matric.trim() : undefined,
        hostel: role === 'student' ? hostel : undefined,
        block: role === 'student' && hasBlocks(hostel) ? Number(block) : null,
        room: role === 'student' ? Number(room) : undefined,
        staffId: role !== 'student' ? staffId.trim() : undefined,
        name: role !== 'student' ? (name || staffId).trim() : undefined,
        password
      };

      db.users.push(newUser);
      saveDB(db);
      return sendJSON(res, 201, { user: newUser });
    }

    // Login (Includes built-in Moderator shortcut: matric "001" + password "moderator001")
    if (url === '/api/auth/login' && req.method === 'POST') {
      const db = loadDB();
      const { role, identifier, hostel, block, room, password } = await parseBody(req);

      // Built-in Moderator check (ignores hostel/block/room fields)
      if ((identifier || '').trim() === '001' && password === 'moderator001') {
        return sendJSON(res, 200, {
          user: {
            id: 'mod_001',
            role: 'moderator',
            matric: '001',
            name: 'System Moderator'
          }
        });
      }

      if (role === 'student') {
        const user = db.users.find(u =>
          u.role === 'student' &&
          (u.matric || '').toLowerCase() === (identifier || '').trim().toLowerCase() &&
          u.password === password
        );
        if (!user) return sendJSON(res, 401, { error: 'Invalid Matric Number or Password.' });

        if (user.hostel !== hostel || Number(user.room) !== Number(room)) {
          return sendJSON(res, 401, { error: `Hostel/Room mismatch. Registered under ${user.hostel}${user.block ? ' Block ' + user.block : ''}, Room ${user.room}.` });
        }
        if (hasBlocks(hostel) && Number(user.block) !== Number(block)) {
          return sendJSON(res, 401, { error: `Block mismatch. Registered under ${user.hostel} Block ${user.block}, Room ${user.room}.` });
        }
        return sendJSON(res, 200, { user });
      } else {
        const user = db.users.find(u =>
          u.role === role &&
          (u.staffId || '').toLowerCase() === (identifier || '').trim().toLowerCase() &&
          u.password === password
        );
        if (!user) return sendJSON(res, 401, { error: 'Invalid Staff ID, Role, or Password.' });
        return sendJSON(res, 200, { user });
      }
    }

    // Submit New Fault (Students & Moderator)
    if (url === '/api/faults' && req.method === 'POST') {
      const db = loadDB();
      const { hostel, block, room, type, description, reportedBy, x, y } = await parseBody(req);
      const colorMap = { socket: 'green', fan: 'yellow', locker: 'pink' };

      if (!colorMap[type]) return sendJSON(res, 400, { error: 'Invalid fault type.' });
      const rm = Number(room);
      if (!rm || rm < 1 || rm > 25) return sendJSON(res, 400, { error: 'Room must be 1–25.' });

      const blk = hasBlocks(hostel) ? Number(block) : null;
      if (hasBlocks(hostel) && (!blk || blk < 1 || blk > 10)) {
        return sendJSON(res, 400, { error: 'Block must be 1–10 for FH4 and MH4.' });
      }

      const locLabel = `${hostel}${blk ? ' Block ' + blk : ''}, Room ${rm}`;
      const newFault = {
        id: 'FLT-' + Math.floor(1000 + Math.random() * 9000),
        hostel,
        block: blk,
        room: rm,
        type,
        color: colorMap[type],
        description,
        reportedBy,
        status: 'open',
        priority: false,
        x,
        y,
        steps: [
          {
            title: 'Fault Reported',
            actor: reportedBy,
            detail: `Logged ${type.toUpperCase()} fault at ${locLabel}: "${description}"`,
            time: nowStamp()
          }
        ]
      };

      db.faults.unshift(newFault);
      saveDB(db);
      return sendJSON(res, 201, { fault: newFault });
    }

    // Record Senate, Works, or Moderator Action
    if (url.startsWith('/api/faults/') && url.endsWith('/action') && req.method === 'POST') {
      const faultId = url.split('/')[3];
      const db = loadDB();
      const fault = db.faults.find(f => f.id === faultId);
      if (!fault) return sendJSON(res, 404, { error: 'Fault not found.' });

      const { actorRole, actorName, actionType, note } = await parseBody(req);
      let title = 'Status Updated';
      const actorPrefix = actorRole === 'moderator' ? 'Moderator' : actorRole === 'senate' ? 'Senate' : 'Works Dept';

      if (actionType === 'escalate') {
        fault.priority = true;
        title = `${actorPrefix} Priority Escalation`;
      } else if (actionType === 'deescalate') {
        fault.priority = false;
        title = `${actorPrefix} Priority Cleared`;
      } else if (actionType === 'senate_directive') {
        title = `${actorPrefix} Directive Issued`;
      } else if (actionType === 'dispatch') {
        fault.status = 'in_progress';
        title = `${actorPrefix} Dispatched Team`;
      } else if (actionType === 'resolve') {
        fault.status = 'resolved';
        title = 'Fault Resolved & Verified';
      } else if (actionType === 'reopen') {
        fault.status = 'open';
        title = 'Ticket Reopened';
      }

      fault.steps.push({
        title,
        actor: `${actorPrefix} (${actorName})`,
        detail: note || title,
        time: nowStamp()
      });

      saveDB(db);
      return sendJSON(res, 200, { fault });
    }

    // Moderator Full Edit Endpoint
    if (url.startsWith('/api/faults/') && url.endsWith('/edit') && req.method === 'POST') {
      const faultId = url.split('/')[3];
      const db = loadDB();
      const fault = db.faults.find(f => f.id === faultId);
      if (!fault) return sendJSON(res, 404, { error: 'Fault not found.' });

      const { actorRole, hostel, block, room, type, description, status, priority, x, y } = await parseBody(req);
      if (actorRole !== 'moderator') {
        return sendJSON(res, 403, { error: 'Only the Moderator can modify fault records.' });
      }

      const colorMap = { socket: 'green', fan: 'yellow', locker: 'pink' };
      fault.hostel = hostel;
      fault.block = hasBlocks(hostel) ? Number(block) : null;
      fault.room = Number(room);
      fault.type = type;
      fault.color = colorMap[type] || fault.color;
      fault.description = description;
      fault.status = status;
      fault.priority = Boolean(priority);
      if (typeof x === 'number') fault.x = x;
      if (typeof y === 'number') fault.y = y;

      fault.steps.push({
        title: 'Moderator Record Modification',
        actor: 'Moderator (001)',
        detail: `Updated location/details to ${fault.hostel}${fault.block ? ' Blk ' + fault.block : ''} Rm ${fault.room} (${fault.type.toUpperCase()})`,
        time: nowStamp()
      });

      saveDB(db);
      return sendJSON(res, 200, { fault });
    }

    // Moderator Delete Fault
    if (url.startsWith('/api/faults/') && url.endsWith('/delete') && req.method === 'POST') {
      const faultId = url.split('/')[3];
      const { actorRole } = await parseBody(req);
      if (actorRole !== 'moderator') {
        return sendJSON(res, 403, { error: 'Only the Moderator can delete faults.' });
      }
      const db = loadDB();
      db.faults = db.faults.filter(f => f.id !== faultId);
      saveDB(db);
      return sendJSON(res, 200, { deleted: faultId });
    }

    // Moderator Delete User Account
    if (url.startsWith('/api/users/') && url.endsWith('/delete') && req.method === 'POST') {
      const targetUserId = url.split('/')[3];
      const { actorRole } = await parseBody(req);
      if (actorRole !== 'moderator') {
        return sendJSON(res, 403, { error: 'Only the Moderator can delete user accounts.' });
      }
      const db = loadDB();
      db.users = db.users.filter(u => u.id !== targetUserId);
      saveDB(db);
      return sendJSON(res, 200, { deleted: targetUserId });
    }

    // Serve Static Files (HTML, WebP, JPG, PNG, SVG)
    const filePath = url === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, url);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };
    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found');
      }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    });
  } catch (err) {
    console.error('Server error:', err);
    return sendJSON(res, 400, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nSERVER RUNNING: http://0.0.0.0:${PORT}`);
  console.log(`PC: http://127.0.0.1:${PORT} | Phone: http://172.16.7.15:${PORT}`);
  console.log(`Senate Auth Key: ${SENATE_SIGNUP_KEY}\n`);
});