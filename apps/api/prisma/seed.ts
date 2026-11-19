/* MSBLR E-Directory seed — idempotent: truncates every table, then inserts reference + demo data.
 * Demo logins (OTP 123456 with DEV_OTP_BYPASS): see README. */
if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* ignore */ }
}
const { PrismaClient } = await import('@prisma/client');
const { ROLE_PERMS, STAFF_ROLES } = await import('@msblr/shared');
const { fyOf } = await import('../src/lib/fy');
const { renderPdf, text } = await import('../src/lib/pdf');
const { storeFile } = await import('../src/lib/files');
const { prisma: libPrisma } = await import('../src/lib/prisma');

const prisma = new PrismaClient();
const DAY = 86400_000;
const now = new Date();
const at = (days: number, hour = 10) => {
  const d = new Date(now.getTime() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

// deterministic RNG so reruns produce the same demo data
let seedState = 20261119;
const rnd = () => {
  seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

async function wipe() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  const list = rows.map((r) => `"${r.tablename}"`).join(',');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

const SURNAMES = ['Rathi', 'Somani', 'Daga', 'Mundra', 'Kabra', 'Bhutada', 'Laddha', 'Toshniwal', 'Bang', 'Jhanwar', 'Biyani', 'Malpani'];
const MALE = ['Ramesh', 'Suresh', 'Mahesh', 'Gopal', 'Rajesh', 'Dinesh', 'Mukesh', 'Anil', 'Vinod', 'Sanjay', 'Kishore', 'Prakash', 'Naresh', 'Ashok', 'Manoj'];
const FEMALE = ['Sunita', 'Anita', 'Kavita', 'Sarita', 'Meena', 'Radha', 'Sangeeta', 'Pooja', 'Nidhi', 'Rekha', 'Vandana', 'Seema', 'Usha', 'Neha'];
const SONS = ['Akash', 'Rohit', 'Aman', 'Karan', 'Vishal', 'Nitin', 'Harsh', 'Rahul', 'Ankit', 'Yash'];
const DAUGHTERS = ['Priya', 'Riya', 'Simran', 'Tanvi', 'Shruti', 'Divya', 'Isha', 'Khushi', 'Muskan', 'Anjali'];
const AREAS = ['Chickpet', 'Jayanagar', 'Malleshwaram', 'Indiranagar', 'Whitefield', 'Basavanagudi', 'Rajajinagar', 'Yelahanka', 'Koramangala', 'V V Puram'];

async function main() {
  await wipe();

  // ---------- roles & permissions ----------
  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin', admin: 'Admin', finance: 'Finance', content: 'Content Manager', ad_manager: 'Ad Manager',
    head: 'Head of Family', family_viewer: 'Family Member', advertiser: 'Advertiser',
  };
  const roles: Record<string, number> = {};
  for (const [name, perms] of Object.entries(ROLE_PERMS)) {
    const r = await prisma.role.create({
      data: { name, label: roleLabels[name]!, isStaff: STAFF_ROLES.includes(name as never), permissions: { create: perms.map((perm) => ({ perm })) } },
    });
    roles[name] = r.id;
  }

  // ---------- zones, categories, placements ----------
  const zoneNames = ['Zone 1 Chickpet', 'Zone 2 Jayanagar', 'Zone 3 Malleshwaram', 'Zone 4 Indiranagar', 'Zone 5 Whitefield'];
  const zones = [];
  for (const [i, name] of zoneNames.entries()) zones.push(await prisma.zone.create({ data: { name, sort: i + 1 } }));

  const cats: [string, string][] = [
    ['Textiles & Garments', 'वस्त्र एवं परिधान'], ['Jewellery', 'आभूषण'], ['Food & Sweets', 'खान-पान एवं मिठाई'], ['Construction & Steel', 'निर्माण एवं स्टील'],
    ['Chartered Accountants & Legal', 'सीए एवं कानूनी सेवाएं'], ['Healthcare', 'स्वास्थ्य सेवा'], ['Education & Coaching', 'शिक्षा एवं कोचिंग'], ['IT & Software', 'आईटी एवं सॉफ्टवेयर'],
    ['Real Estate', 'रियल एस्टेट'], ['Wholesale & Trading', 'थोक एवं व्यापार'], ['Printing & Stationery', 'प्रिंटिंग एवं स्टेशनरी'], ['Events & Catering', 'इवेंट्स एवं कैटरिंग'],
  ];
  const catRows = [];
  for (const [i, [nameEn, nameHi]] of cats.entries()) catRows.push(await prisma.businessCategory.create({ data: { nameEn, nameHi, sort: i + 1 } }));

  const placementsDef = [
    { code: 'HOME_CAROUSEL', name: 'Home carousel (web & app)', platform: 'BOTH', width: 1600, height: 600, maxKb: 800, formats: 'jpg,png,mp4', videoMaxS: 30, prices: [6000, 16000, 30000, 55000] },
    { code: 'WEB_SIDE', name: 'Business tab side banner (web)', platform: 'WEB', width: 300, height: 600, maxKb: 300, formats: 'jpg,png', videoMaxS: null, prices: [2500, 6500, 12000, 22000] },
    { code: 'WEB_INLINE', name: 'Web inline banner', platform: 'WEB', width: 1200, height: 200, maxKb: 400, formats: 'jpg,png', videoMaxS: null, prices: [2000, 5500, 10000, 18000] },
    { code: 'WEB_FOOTER', name: 'Web footer strip', platform: 'WEB', width: 1200, height: 120, maxKb: 250, formats: 'jpg,png', videoMaxS: null, prices: [1000, 2800, 5000, 9000] },
    { code: 'WEB_BIZ_SPOTLIGHT', name: 'Business spotlight (web)', platform: 'WEB', width: 600, height: 400, maxKb: 300, formats: 'jpg,png', videoMaxS: null, prices: [3000, 8000, 15000, 27000] },
    { code: 'APP_CARD', name: 'In-app card (between sections)', platform: 'APP', width: 1080, height: 540, maxKb: 500, formats: 'jpg,png', videoMaxS: null, prices: [3500, 9500, 17000, 31000] },
    { code: 'APP_BIZ_CARD', name: 'In-app business list card', platform: 'APP', width: 1080, height: 400, maxKb: 400, formats: 'jpg,png', videoMaxS: null, prices: [2500, 6500, 12000, 22000] },
    { code: 'APP_LOADING', name: 'App loading screen', platform: 'APP', width: 1080, height: 300, maxKb: 250, formats: 'jpg,png', videoMaxS: null, prices: [4000, 10500, 19000, 35000] },
  ] as const;
  const periods = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const;
  const placements: Record<string, { id: number; planIds: number[] }> = {};
  for (const p of placementsDef) {
    const row = await prisma.adPlacement.create({
      data: {
        code: p.code, name: p.name, platform: p.platform, width: p.width, height: p.height, maxKb: p.maxKb, formats: p.formats, videoMaxS: p.videoMaxS,
        plans: { create: periods.map((period, i) => ({ period, price: p.prices[i]! })) },
      },
      include: { plans: true },
    });
    placements[p.code] = { id: row.id, planIds: row.plans.sort((a, b) => a.id - b.id).map((x) => x.id) };
  }

  // ---------- settings ----------
  const settings: Record<string, unknown> = {
    theme: 'c',
    upi: { id: 'msblr@upi', payeeName: 'Maheshwari Sabha Bengaluru', qrFileId: null },
    subscription: { amount: 1100, yearMode: 'FY' },
    trustedDeviceDays: 30,
    businessApprovalRequired: true,
    contentStaleDays: 10,
    wishTemplates: {
      birthday: { en: 'Happy Birthday, {name}! Maheshwari Sabha Bengaluru wishes you good health and joy.', hi: 'जन्मदिन की हार्दिक शुभकामनाएं, {name}! माहेश्वरी सभा बेंगलुरु की ओर से स्वस्थ और सुखी जीवन की कामना।' },
      anniversary: { en: 'Happy Anniversary, {name}! Wishing you a lifetime of togetherness.', hi: 'विवाह की वर्षगांठ की हार्दिक शुभकामनाएं, {name}! आपका साथ सदा बना रहे।' },
    },
    receiptPrefix: 'R',
    publicSite: {
      about: {
        en: 'Maheshwari Sabha, Bengaluru is the community organisation that serves the Maheshwari families living in Bengaluru. We bring families together through social, cultural and religious activities, and celebrate our traditions, including Mahesh Navami, as one community.\n\nThrough our trusts we support education and medical aid for those in need. This website and the MSBLR E-Directory help members stay connected, find one another and take part in the life of the Sabha.',
        hi: 'माहेश्वरी सभा, बेंगलुरु बेंगलुरु में रहने वाले माहेश्वरी परिवारों की सेवा करने वाली सामुदायिक संस्था है। हम सामाजिक, सांस्कृतिक और धार्मिक गतिविधियों के माध्यम से परिवारों को जोड़ते हैं तथा महेश नवमी सहित अपनी परंपराओं को एक समाज के रूप में मनाते हैं।\n\nअपने ट्रस्टों के माध्यम से हम ज़रूरतमंदों के लिए शिक्षा और चिकित्सा सहायता में सहयोग करते हैं। यह वेबसाइट और MSBLR ई-डायरेक्टरी सदस्यों को जुड़े रहने, एक-दूसरे को खोजने और सभा के कार्यों में भाग लेने में मदद करती है।',
      },
      committee: [],
      showHighlightPhotos: false,
      mapsUrl: '',
    },
    sabha: {
      name: 'Maheshwari Sabha, Bengaluru', nameHi: 'माहेश्वरी सभा, बेंगलुरु',
      address: 'Maheshwari Bhavan, Okalipuram, Bengaluru 560021', phone: '080-2345 6789', email: 'mahsabblr@gmail.com',
    },
  };
  for (const [key, value] of Object.entries(settings)) await prisma.setting.create({ data: { key, value: value as never } });

  // ---------- staff & demo logins ----------
  const staff: [string, string, string, number | null][] = [
    ['9000000001', 'Super Admin (Demo)', 'super_admin', null],
    ['9000000002', 'Finance Secretary (Demo)', 'finance', null],
    ['9000000003', 'Zone 1 Content Manager (Demo)', 'content', zones[0]!.id],
    ['9000000004', 'Ad Manager (Demo)', 'ad_manager', null],
  ];
  const staffUsers: Record<string, number> = {};
  for (const [mobile, displayName, role, zoneId] of staff) {
    const u = await prisma.user.create({ data: { mobile, displayName, roles: { create: { roleId: roles[role]!, zoneId } } } });
    staffUsers[role] = u.id;
  }

  // ---------- families & persons ----------
  const userByPerson: Record<number, number> = {};
  const familyIds: number[] = [];
  const activeFamilyIds: number[] = [];
  const headPersonByFamily: Record<number, number> = {};
  const usedMobiles = new Set<string>();
  const mobile = () => {
    for (;;) {
      const m = `${pick(['98', '97', '99', '96', '91'])}${int(10000000, 99999999)}`;
      if (!usedMobiles.has(m) && m !== '9845012345' && m !== '9900045678') { usedMobiles.add(m); return m; }
    }
  };
  const todayDob = (age: number) => new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const randDob = (minAge: number, maxAge: number) => new Date(now.getFullYear() - int(minAge, maxAge), int(0, 11), int(1, 28));

  const N = 40;
  let membershipCounter = 0;
  const wishToday = new Set([3, 11, 19]); // families with a birthday today
  for (let i = 0; i < N; i++) {
    const surname = i === 0 ? 'Rathi' : SURNAMES[i % SURNAMES.length]!;
    // 0 = Ramesh Rathi demo; 34..36 pending; 37 rejected; 38-39 inactive
    const status = i >= 38 ? 'INACTIVE' : i === 37 ? 'REJECTED' : i >= 34 ? 'PENDING' : 'ACTIVE';
    let membershipNo: string | null = null;
    if (status === 'ACTIVE' || status === 'INACTIVE') {
      if (i === 0) membershipNo = 'MSB-0412';
      else { membershipCounter++; if (membershipCounter === 412) membershipCounter++; membershipNo = `MSB-${String(membershipCounter).padStart(4, '0')}`; }
    }
    const sub = status !== 'ACTIVE' ? (status === 'INACTIVE' ? 'EXPIRED' : 'DUE') : i % 7 === 3 ? 'DUE' : i % 11 === 5 ? 'EXPIRED' : 'ACTIVE';
    const validUntil = sub === 'ACTIVE' ? new Date(2027, 2, 31) : sub === 'EXPIRED' ? new Date(2026, 2, 31) : null;
    const zone = zones[i % zones.length]!;
    const area = i === 0 ? 'Chickpet' : pick(AREAS);
    const family = await prisma.family.create({
      data: {
        membershipNo, zoneId: zone.id, status, subscriptionStatus: sub, subscriptionValidUntil: validUntil,
        addressLine: `${int(1, 250)}, ${int(1, 18)}th Cross, ${area}`, area, pincode: `5600${String(int(1, 99)).padStart(2, '0')}`,
      },
    });
    familyIds.push(family.id);
    if (status === 'ACTIVE') activeFamilyIds.push(family.id);

    const people: { name: string; relation: string; gender: 'MALE' | 'FEMALE'; head: boolean; dob: Date; anniversary?: Date | null; mobile: string | null; occupation?: string }[] = [];
    const headName = i === 0 ? 'Ramesh' : pick(MALE);
    const spouseName = i === 0 ? 'Sunita' : pick(FEMALE);
    const anniv = new Date(now.getFullYear() - int(5, 35), int(0, 11), int(1, 28));
    people.push({ name: `${headName} ${surname}`, relation: 'SELF', gender: 'MALE', head: true, dob: i === 0 ? randDob(48, 52) : randDob(40, 70), anniversary: anniv, mobile: i === 0 ? '9845012345' : mobile(), occupation: pick(['Businessman', 'Trader', 'CA', 'Retired', 'Engineer', 'Doctor']) });
    people.push({ name: `${spouseName} ${surname}`, relation: 'SPOUSE', gender: 'FEMALE', head: false, dob: wishToday.has(i) ? todayDob(44) : randDob(36, 66), anniversary: anniv, mobile: i === 0 ? '9900045678' : mobile(), occupation: 'Homemaker' });
    const kids = i === 0 ? 2 : int(0, 3);
    for (let k = 0; k < kids; k++) {
      const son = i === 0 ? k === 0 : rnd() > 0.5;
      people.push({ name: `${i === 0 ? (son ? 'Akash' : 'Priya') : son ? pick(SONS) : pick(DAUGHTERS)} ${surname}`, relation: son ? 'SON' : 'DAUGHTER', gender: son ? 'MALE' : 'FEMALE', head: false, dob: randDob(8, 30), mobile: rnd() > 0.4 ? mobile() : null, occupation: 'Student' });
    }
    if (i === 5) people.push({ name: `Kamla ${surname}`, relation: 'MOTHER', gender: 'FEMALE', head: false, dob: todayDob(72), mobile: null, occupation: 'Retired' });

    for (const [pi, p] of people.entries()) {
      const person = await prisma.person.create({
        data: {
          familyId: family.id, isHead: p.head, name: p.name, relation: p.relation as never, gender: p.gender, dob: p.dob, anniversary: p.anniversary ?? null,
          mobile: p.mobile, email: p.mobile && p.head ? `${p.name.split(' ')[0]!.toLowerCase()}@example.com` : null, occupation: p.occupation,
          education: p.relation === 'SON' || p.relation === 'DAUGHTER' ? 'Student' : pick(['B.Com', 'B.E.', 'M.Com', 'MBA', '12th', 'CA']),
          bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-']),
        },
      });
      if (p.head) headPersonByFamily[family.id] = person.id;
      // a few privacy overrides to showcase locks
      if (i === 0 && pi === 0) await prisma.privacySetting.createMany({ data: [{ personId: person.id, field: 'email', visible: false }, { personId: person.id, field: 'dob', visible: false }] });
      if (i === 0 && pi === 1) await prisma.privacySetting.createMany({ data: [{ personId: person.id, field: 'mobile', visible: false }, { personId: person.id, field: 'photo', visible: false }] });
      if (i % 6 === 2 && pi === 0) await prisma.privacySetting.create({ data: { personId: person.id, field: 'mobile', visible: false } });
      if (i % 9 === 4 && pi === 0) await prisma.privacySetting.create({ data: { personId: person.id, field: 'email', visible: true } });
      // logins: heads of ACTIVE families get a login; Ramesh + Sunita are the documented demo users
      if (status === 'ACTIVE' && p.mobile && ((p.head) || (i === 0 && pi === 1))) {
        const u = await prisma.user.create({
          data: { mobile: p.mobile, personId: person.id, displayName: p.name, roles: { create: { roleId: roles[p.head ? 'head' : 'family_viewer']! } } },
        });
        userByPerson[person.id] = u.id;
      }
    }
  }

  // registrations (history for all, pending for PENDING/REJECTED families)
  for (const [i, fid] of familyIds.entries()) {
    const fam = await prisma.family.findUniqueOrThrow({ where: { id: fid } });
    const pend = fam.status === 'PENDING';
    const rej = fam.status === 'REJECTED';
    await prisma.registration.create({
      data: {
        familyId: fid, submittedAt: at(pend ? -int(1, 5) : -int(30, 300)),
        status: pend ? 'PENDING' : rej ? 'REJECTED' : 'APPROVED',
        decidedBy: pend ? null : staffUsers.super_admin, decidedAt: pend ? null : at(-int(1, 25)),
        remarks: rej ? 'Documents unclear. Please re-submit with a clear address proof.' : null,
      },
    });
    void i;
  }

  // login activation requests: Akash requested (pending); Sunita approved earlier
  const rathi = await prisma.person.findMany({ where: { familyId: familyIds[0]! }, orderBy: { id: 'asc' } });
  const headUser = userByPerson[rathi[0]!.id]!;
  await prisma.loginActivationRequest.create({ data: { personId: rathi[2]!.id, requestedBy: headUser, status: 'PENDING' } });
  await prisma.loginActivationRequest.create({ data: { personId: rathi[1]!.id, requestedBy: headUser, status: 'APPROVED', decidedBy: staffUsers.super_admin, decidedAt: at(-40) } });

  // ---------- businesses ----------
  const bizNames = ['Rathi Textiles', 'Somani Jewellers', 'Daga Sweets', 'Mundra Steel', 'Kabra & Associates', 'Bhutada Sweets', 'Laddha Diagnostics', 'Toshniwal Tutorials', 'Bang Infotech', 'Jhanwar Realty', 'Biyani Traders', 'Malpani Printers', 'Shree Events & Catering', 'Maheshwari Silks', 'Gold Palace', 'Annapurna Foods', 'Vishwas Builders', 'Rajasthan Dry Fruits', 'Om Stationers', 'Techno Solutions'];
  for (const [i, name] of bizNames.entries()) {
    const fid = activeFamilyIds[(i * 2) % activeFamilyIds.length]!;
    const cat = catRows[i % catRows.length]!;
    const fam = await prisma.family.findUniqueOrThrow({ where: { id: fid } });
    await prisma.business.create({
      data: {
        familyId: fid, personId: headPersonByFamily[fid]!, name, categoryId: cat.id, area: fam.area,
        description: `${name} — trusted by the Maheshwari community in Bengaluru. Quality and service since ${int(1975, 2015)}.`,
        addressLine: fam.addressLine, phone: `080${int(20000000, 49999999)}`, whatsapp: `9${int(800000000, 899999999)}`,
        website: i % 3 === 0 ? `https://www.${name.toLowerCase().replace(/[^a-z]/g, '')}.example` : null,
        mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(name + ' Bengaluru')}`,
        status: i % 9 === 8 ? 'PENDING' : i === 17 ? 'HIDDEN' : 'APPROVED',
      },
    });
  }
  // Ramesh Rathi's own business
  await prisma.business.create({ data: { familyId: familyIds[0]!, personId: rathi[0]!.id, name: 'Rathi Textiles', categoryId: catRows[0]!.id, area: 'Chickpet', description: 'Wholesale sarees and dress materials in Chickpet since 1982.', phone: '08022223333', whatsapp: '9845012345', status: 'APPROVED' } });

  // ---------- static contacts ----------
  const contacts: [string, string, string, string | null][] = [
    ['EMERGENCY', 'Police', '112', 'All-India emergency'], ['EMERGENCY', 'Ambulance', '108', null], ['EMERGENCY', 'Fire', '101', null], ['EMERGENCY', "Women's helpline", '1091', null],
    ['SABHA', 'Sabha Office', '080-2345 6789', 'Mon–Sat, 10 am – 6 pm'], ['SABHA', 'President', '9000011111', 'Placeholder number'], ['SABHA', 'Secretary', '9000022222', 'Placeholder number'], ['SABHA', 'Treasurer', '9000033333', 'Placeholder number'],
  ];
  for (const [i, [section, name, phone, details]] of contacts.entries()) await prisma.staticContact.create({ data: { section, name, phone, details, sort: i } });

  // ---------- trusts ----------
  const trusts: [string, string, [string, string][]][] = [
    ['Maheshwari Education Trust', 'Scholarships and hostel support for students of the community.', [['Scholarship application form', 'https://example.org/scholarship'], ['Annual report', 'https://example.org/edu-report']]],
    ['Maheshwari Medical Relief Trust', 'Medical camps and financial help for treatment.', [['Eligibility guidelines', 'https://example.org/medical']]],
    ['Maheshwari Bhavan Trust', 'Manages Maheshwari Bhavan, the community hall at Okalipuram.', [['Hall booking rules', 'https://example.org/bhavan']]],
  ];
  for (const [i, [name, description, atts]] of trusts.entries()) {
    await prisma.trust.create({ data: { name, description, sort: i, attachments: { create: atts.map(([label, url]) => ({ label, url })) } } });
  }

  // ---------- events, highlights, announcements ----------
  const agm = await prisma.event.create({ data: { title: 'Annual General Meeting 2026', kind: 'AGM', body: 'All member families are invited to the AGM. Agenda: accounts, elections, new projects.', startsAt: new Date(2026, 11, 14, 10, 30), venue: 'Maheshwari Bhavan, Okalipuram', createdBy: staffUsers.super_admin } });
  await prisma.event.createMany({
    data: [
      { title: 'Executive Committee Meeting', kind: 'EC', startsAt: at(6, 18), venue: 'Sabha Office', createdBy: staffUsers.super_admin },
      { title: 'Zone 1 Sneh Milan', kind: 'SOCIAL', zoneId: zones[0]!.id, startsAt: at(12, 17), venue: 'Chickpet Community Hall', createdBy: staffUsers.content },
      { title: 'Gita Path & Satsang', kind: 'RELIGIOUS', startsAt: at(20, 7), venue: 'Maheshwari Bhavan', createdBy: staffUsers.super_admin },
      { title: 'Kids Sports Day', kind: 'SPORTS', zoneId: zones[4]!.id, startsAt: at(35, 9), venue: 'Whitefield Ground', registrationUrl: 'https://example.org/register/sports-day', createdBy: staffUsers.content },
      { title: 'Maheshwari Navami Cultural Evening', kind: 'CULTURAL', startsAt: at(-120, 18), venue: 'Maheshwari Bhavan', createdBy: staffUsers.super_admin },
      { title: 'Diwali Sneh Milan 2026', kind: 'SOCIAL', startsAt: at(-12, 17), endsAt: at(-12, 21), venue: 'Maheshwari Bhavan', createdBy: staffUsers.super_admin },
      { title: 'Blood Donation Camp', kind: 'OTHER', zoneId: zones[1]!.id, startsAt: at(-45, 9), venue: 'Jayanagar Hall', createdBy: staffUsers.content },
      { title: 'Draft: Youth Meet (unpublished)', kind: 'OTHER', startsAt: at(50, 10), status: 'DRAFT', createdBy: staffUsers.content },
    ],
  });
  const diwali = await prisma.event.findFirstOrThrow({ where: { title: 'Diwali Sneh Milan 2026' } });
  await prisma.highlight.createMany({
    data: [
      { eventId: diwali.id, title: 'Diwali Sneh Milan 2026', summary: '600+ members came together at Maheshwari Bhavan for lamps, sweets and music.', authorId: staffUsers.super_admin, publishedAt: at(-10) },
      { title: 'Blood Donation Camp — 85 units collected', summary: 'Thank you to every donor from Zone 2.', authorId: staffUsers.content, publishedAt: at(-40) },
      { title: 'Navami Cultural Evening', summary: 'An evening of Rajasthani folk dance and poetry.', authorId: staffUsers.super_admin, publishedAt: at(-118) },
    ],
  });
  await prisma.announcement.createMany({
    data: [
      { title: 'Subscription for FY 2026-27 is open', body: 'Please pay by UPI and upload the screenshot from the Subscription page.', pinned: true },
      { title: 'AGM on 14 December', body: 'Notice has been published in Events.', expiresAt: at(30) },
    ],
  });

  // ---------- advertisers, ads ----------
  const advUser = async (name: string, contactPerson: string, mob: string, email: string, withLogin: boolean) => {
    const a = await prisma.advertiser.create({ data: { name, contactPerson, mobile: mob, email } });
    if (withLogin) await prisma.user.create({ data: { mobile: mob, advertiserId: a.id, displayName: contactPerson, roles: { create: { roleId: roles.advertiser! } } } });
    return a;
  };
  const advMundra = await advUser('Mundra Steel', 'Rakesh Mundra', '9000000005', 'rakesh@mundrasteel.example', true);
  const advBhutada = await advUser('Bhutada Sweets', 'Pawan Bhutada', '9886600011', 'pawan@bhutadasweets.example', false);
  await prisma.advertiser.update({ where: { id: advMundra.id }, data: { memberFamilyId: familyIds[3]! } });

  const mkAdRequest = (advertiserId: number, code: string, periodIdx: number, status: 'LIVE' | 'REQUESTED' | 'CONTENT_SUBMITTED' | 'RETURNED' | 'EXPIRED', notes?: string, remarks?: string) =>
    prisma.adRequest.create({ data: { advertiserId, placementId: placements[code]!.id, planId: placements[code]!.planIds[periodIdx]!, status, notes, remarks } });
  const reqMundra = await mkAdRequest(advMundra.id, 'WEB_SIDE', 2, 'LIVE');
  const reqBhutada = await mkAdRequest(advBhutada.id, 'HOME_CAROUSEL', 1, 'LIVE');
  const reqBhutadaCard = await mkAdRequest(advBhutada.id, 'APP_CARD', 0, 'CONTENT_SUBMITTED', 'Diwali offer card');
  // Submitted content must have an Ad row, otherwise admin approval has nothing to schedule.
  await prisma.ad.create({ data: { requestId: reqBhutadaCard.id, title: 'Bhutada Sweets — Diwali gift boxes, 15% off for members', clickType: 'WHATSAPP', clickValue: '9886600011', priority: 1 } });
  await mkAdRequest(advMundra.id, 'APP_LOADING', 0, 'REQUESTED', 'Text line for loading screen');
  await mkAdRequest(advMundra.id, 'WEB_FOOTER', 0, 'RETURNED', undefined, 'Image is blurry. Please upload 1200 × 120 px.');
  await mkAdRequest(advBhutada.id, 'WEB_INLINE', 0, 'EXPIRED');
  const adMundra = await prisma.ad.create({ data: { requestId: reqMundra.id, title: 'Mundra Steel — Your partner in construction since 1985', clickType: 'CALL', clickValue: '9886600022', priority: 2, startsAt: at(-30, 0), endsAt: at(150, 23) } });
  const adBhutada = await prisma.ad.create({ data: { requestId: reqBhutada.id, title: 'Bhutada Sweets — Fresh sweets, every festival', clickType: 'WHATSAPP', clickValue: '9886600011', priority: 3, startsAt: at(-20, 0), endsAt: at(70, 23) } });
  for (const ad of [adMundra, adBhutada]) {
    const rows = [];
    for (let d = 13; d >= 0; d--) {
      const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - d));
      const impressions = int(120, 520);
      rows.push({ adId: ad.id, date, impressions, uniqueViewers: Math.round(impressions * 0.6), clicksCall: ad === adMundra ? int(2, 18) : 0, clicksWhatsapp: ad === adBhutada ? int(3, 25) : 0, clicksWeb: int(0, 5) });
    }
    await prisma.adStatDaily.createMany({ data: rows });
  }

  // ---------- banners ----------
  await prisma.banner.createMany({
    data: [
      { kind: 'BANNER', title: 'Upcoming · AGM', subtitle: 'Annual General Meeting 2026 · Sunday, 14 December', sort: 1, durationMs: 6000, linkUrl: `/events/${agm.id}` },
      { kind: 'AD', title: adBhutada.title, adId: adBhutada.id, sort: 2, durationMs: 5000 },
      { kind: 'BANNER', title: 'Diwali Sneh Milan 2026', subtitle: '600+ members celebrated together', sort: 3, durationMs: 6000 },
      { kind: 'VIDEO', title: 'Sabha at a glance', subtitle: 'Placeholder video slot', sort: 4, durationMs: 15000, active: false },
    ],
  });

  // ---------- payments & receipts ----------
  const subAmount = 1100;
  const fy = fyOf(now);
  const payers = activeFamilyIds.slice(0, 16);
  let receiptNo = 0;
  const makePdf = async (serial: string, member: string, amount: number, utr: string) => {
    const buf = await renderPdf((doc) => {
      text(doc, 'Maheshwari Sabha, Bengaluru', 40, 50, { bold: true, size: 18 });
      text(doc, 'माहेश्वरी सभा, बेंगलुरु', 40, 76, { size: 13 });
      text(doc, `Receipt ${serial}`, 40, 120, { bold: true, size: 14 });
      text(doc, `Received from: ${member}`, 40, 150, { size: 12 });
      text(doc, `Amount: Rs. ${amount}`, 40, 170, { size: 12 });
      text(doc, `UTR: ${utr}`, 40, 190, { size: 12 });
      text(doc, `Purpose: Subscription ${fy}`, 40, 210, { size: 12 });
    });
    return storeFile({ buffer: buf, filename: `${serial.replace(/\//g, '-')}.pdf`, mime: 'application/pdf', kind: 'receipt_pdf', visibility: 'PRIVATE', ownerUserId: null });
  };
  for (const [i, fid] of payers.entries()) {
    const head = await prisma.person.findFirstOrThrow({ where: { familyId: fid, isHead: true } });
    const state = i < 10 ? 'APPROVED' : i < 13 ? 'PENDING' : 'REJECTED';
    const utr = `UTR${String(2026110000 + i * 137).padStart(12, '0')}`;
    const pay = await prisma.payment.create({
      data: {
        kind: 'SUBSCRIPTION', familyId: fid, payerUserId: userByPerson[head.id] ?? null, amount: subAmount, utr, paidOn: at(-int(1, 40)),
        purpose: `Subscription ${fy}`, periodLabel: fy, status: state,
        verifiedBy: state === 'PENDING' ? null : staffUsers.finance, verifiedAt: state === 'PENDING' ? null : at(-int(0, 5)),
        remarks: state === 'REJECTED' ? 'UTR not found in the bank statement.' : null,
      },
    });
    if (state === 'APPROVED') {
      receiptNo++;
      const serial = `R/${fy}/${String(receiptNo).padStart(4, '0')}`;
      const pdf = await makePdf(serial, head.name, subAmount, utr);
      await prisma.receipt.create({ data: { paymentId: pay.id, serialNo: serial, fy, familyId: fid, memberName: head.name, amount: subAmount, purpose: `Subscription ${fy}`, utr, issuedAt: pay.verifiedAt!, pdfFileId: pdf.id } });
    }
  }
  await prisma.receiptCounter.create({ data: { fy, lastNo: receiptNo } });
  // legacy receipts (imported from the paper register)
  for (let n = 1; n <= 3; n++) {
    await prisma.receipt.create({ data: { serialNo: `R/25-26/${String(n).padStart(4, '0')}`, fy: '25-26', familyId: activeFamilyIds[n]!, memberName: `Legacy member ${n}`, amount: 1000, purpose: 'Subscription 25-26', issuedAt: new Date(2025, 5, n * 3), legacy: true } });
  }
  await prisma.receiptCounter.create({ data: { fy: '25-26', lastNo: 3 } });
  // ad payment (approved) for Mundra Steel
  await prisma.payment.create({ data: { kind: 'AD', adRequestId: reqMundra.id, payerUserId: (await prisma.user.findUniqueOrThrow({ where: { mobile: '9000000005' } })).id, amount: 12000, utr: 'UTR000900000001', paidOn: at(-31), purpose: 'Ad: Business tab side banner (6 months)', status: 'APPROVED', verifiedBy: staffUsers.finance, verifiedAt: at(-30) } });
  await prisma.payment.create({ data: { kind: 'AD', adRequestId: reqBhutada.id, amount: 16000, utr: 'UTR000900000002', paidOn: at(-1), purpose: 'Ad: Home carousel (3 months)', status: 'PENDING' } });

  // ---------- notifications ----------
  const ramesh = headUser;
  const n1 = await prisma.notification.create({ data: { title: 'AGM on 14 December', body: 'Annual General Meeting at Maheshwari Bhavan, 10:30 am. All families are invited.', titleHi: '14 दिसंबर को वार्षिक आम सभा', bodyHi: 'माहेश्वरी भवन में प्रातः 10:30 बजे। सभी परिवार आमंत्रित हैं।', audience: 'ALL', kind: 'general', sentBy: staffUsers.super_admin, sentAt: at(-3) } });
  const n2 = await prisma.notification.create({ data: { title: 'Subscription reminder', body: 'Your subscription for 2026-27 is due. Please pay by UPI and upload the screenshot.', titleHi: 'सदस्यता शुल्क अनुस्मारक', bodyHi: 'वर्ष 2026-27 की सदस्यता देय है। कृपया UPI से भुगतान कर स्क्रीनशॉट अपलोड करें।', audience: 'LIST', audienceRef: String(ramesh), kind: 'reminder', sentBy: staffUsers.finance, sentAt: at(-2) } });
  const n3 = await prisma.notification.create({ data: { title: 'Happy Birthday, Ramesh!', body: 'Maheshwari Sabha Bengaluru wishes you good health and joy.', titleHi: 'जन्मदिन मुबारक, रमेश!', bodyHi: 'माहेश्वरी सभा बेंगलुरु की ओर से स्वस्थ और सुखी जीवन की कामना।', audience: 'SINGLE', audienceRef: String(ramesh), kind: 'wish', sentAt: at(-60) } });
  const userIds = (await prisma.user.findMany({ where: { personId: { not: null } }, select: { id: true } })).map((u) => u.id);
  await prisma.notificationDelivery.createMany({ data: userIds.map((userId) => ({ notificationId: n1.id, userId, readAt: userId === ramesh ? null : at(-2), pushStatus: 'no_token' })) });
  await prisma.notificationDelivery.create({ data: { notificationId: n2.id, userId: ramesh, pushStatus: 'no_token' } });
  await prisma.notificationDelivery.create({ data: { notificationId: n3.id, userId: ramesh, readAt: at(-59), pushStatus: 'no_token' } });
  await prisma.messageTemplate.createMany({
    data: [
      { name: 'Event reminder', title: 'Event reminder', body: 'Reminder: {event} on {date} at {venue}. We look forward to seeing you.' },
      { name: 'Subscription due', title: 'Subscription reminder', body: 'Your Sabha subscription is due. Please pay by UPI and upload the screenshot in the app.' },
      { name: 'Condolence', title: 'Condolence', body: 'With deep sorrow we inform the passing of {name}. May the soul rest in peace.' },
    ],
  });

  // ---------- audit ----------
  const A = (daysAgo: number, actor: string, role: string, userId: number, action: string, entity: string, entityId: string, summary: string, before?: unknown, after?: unknown) =>
    prisma.auditLog.create({ data: { at: at(-daysAgo, 11), actorUserId: userId, actorName: actor, actorRole: role, action, entity, entityId, summary, before: before as never, after: after as never, ip: '127.0.0.1' } });
  await A(30, 'Super Admin (Demo)', 'super_admin', staffUsers.super_admin, 'auth.login', 'user', String(staffUsers.super_admin), 'Signed in (web)');
  await A(28, 'Super Admin (Demo)', 'super_admin', staffUsers.super_admin, 'registration.approve', 'registration', '1', 'Approved registration of Rathi family (MSB-0412)', { status: 'PENDING' }, { status: 'APPROVED', membershipNo: 'MSB-0412' });
  await A(26, 'Super Admin (Demo)', 'super_admin', staffUsers.super_admin, 'login.approve', 'person', String(rathi[1]!.id), 'Approved login for Sunita Rathi', { status: 'PENDING' }, { status: 'APPROVED' });
  await A(12, 'Finance Secretary (Demo)', 'finance', staffUsers.finance, 'payment.approve', 'payment', '1', 'Approved subscription payment, receipt issued', { status: 'PENDING' }, { status: 'APPROVED' });
  await A(11, 'Finance Secretary (Demo)', 'finance', staffUsers.finance, 'payment.reject', 'payment', String(payers.length), 'Rejected payment: UTR not found', { status: 'PENDING' }, { status: 'REJECTED' });
  await A(10, 'Zone 1 Content Manager (Demo)', 'content', staffUsers.content, 'highlight.create', 'highlight', '1', 'Posted highlight: Diwali Sneh Milan 2026');
  await A(9, 'Super Admin (Demo)', 'super_admin', staffUsers.super_admin, 'event.update', 'event', String(agm.id), 'Updated AGM venue', { venue: 'Sabha Office' }, { venue: 'Maheshwari Bhavan, Okalipuram' });
  await A(5, 'Ad Manager (Demo)', 'ad_manager', staffUsers.ad_manager, 'ad.approve', 'ad', String(adMundra.id), 'Approved ad: Mundra Steel');
  await A(3, 'Super Admin (Demo)', 'super_admin', staffUsers.super_admin, 'notification.send', 'notification', String(n1.id), 'Sent push to all: AGM on 14 December');
  await A(1, 'Ramesh Rathi', 'head', ramesh, 'person.update', 'person', String(rathi[0]!.id), 'Updated own profile', { occupation: 'Trader' }, { occupation: 'Businessman' });

  void libPrisma;
  console.log(`Seeded: ${familyIds.length} families, ${receiptNo} receipts for ${fy}.`);
}

main()
  .then(async () => { await prisma.$disconnect(); await libPrisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
