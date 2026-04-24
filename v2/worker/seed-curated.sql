-- Seed curated artists (popularity proxy).
-- Ported from legacy app.js CURATED_TELUGU_ARTISTS / CURATED_HINDI_ARTISTS.
-- Run once after schema.sql:
--   wrangler d1 execute raagam --local --file=worker/seed-curated.sql

-- Telugu
INSERT OR REPLACE INTO curated_artists (name, language, weight, kind) VALUES
  ('s. p. balasubrahmanyam','telugu',2.0,'singer'),('ghantasala','telugu',2.0,'singer'),
  ('p. susheela','telugu',1.8,'singer'),('s. janaki','telugu',1.8,'singer'),
  ('sid sriram','telugu',2.0,'singer'),('armaan malik','telugu',1.6,'singer'),
  ('anurag kulkarni','telugu',1.6,'singer'),('haricharan','telugu',1.5,'singer'),
  ('shreya ghoshal','both',2.0,'singer'),('sunitha','telugu',1.5,'singer'),
  ('chinmayi','telugu',1.5,'singer'),('mangli','telugu',1.5,'singer'),
  ('thaman s','telugu',2.0,'composer'),('devi sri prasad','telugu',2.0,'composer'),
  ('s. s. thaman','telugu',1.8,'composer'),('m. m. keeravani','telugu',2.0,'composer'),
  ('ilaiyaraaja','both',1.8,'composer'),('a. r. rahman','both',2.2,'composer'),
  ('shankar mahadevan','both',1.6,'both'),('karthik','telugu',1.5,'singer'),
  ('sagar','telugu',1.3,'singer'),('rahul sipligunj','telugu',1.5,'singer'),
  ('javed ali','both',1.4,'singer'),('krishna chaitanya','telugu',1.3,'singer'),
  ('ramya behara','telugu',1.4,'singer'),('mohana bhogaraju','telugu',1.4,'singer'),
  ('yazin nizar','telugu',1.3,'singer'),('roll rida','telugu',1.3,'singer'),
  ('nakash aziz','both',1.4,'singer'),('shweta mohan','telugu',1.3,'singer'),
  ('kaala bhairava','telugu',1.4,'singer'),('pradeep kumar','telugu',1.3,'singer'),
  ('anup rubens','telugu',1.4,'composer'),('mickey j meyer','telugu',1.5,'composer'),
  ('hemachandra','telugu',1.3,'singer'),('geetha madhuri','telugu',1.3,'singer'),
  ('dhanunjay','telugu',1.3,'singer'),('sahithi','telugu',1.3,'singer');

-- Hindi
INSERT OR REPLACE INTO curated_artists (name, language, weight, kind) VALUES
  ('arijit singh','hindi',2.5,'singer'),('lata mangeshkar','hindi',2.0,'singer'),
  ('kishore kumar','hindi',2.0,'singer'),('mohammed rafi','hindi',2.0,'singer'),
  ('sonu nigam','hindi',1.8,'singer'),('atif aslam','hindi',1.8,'singer'),
  ('jubin nautiyal','hindi',1.8,'singer'),('neha kakkar','hindi',1.6,'singer'),
  ('armaan malik','hindi',1.8,'singer'),('pritam','hindi',2.0,'composer'),
  ('vishal mishra','hindi',1.6,'singer'),('b praak','hindi',1.6,'singer'),
  ('darshan raval','hindi',1.5,'singer'),('kumar sanu','hindi',1.7,'singer'),
  ('udit narayan','hindi',1.7,'singer'),('alka yagnik','hindi',1.7,'singer'),
  ('asha bhosle','hindi',1.9,'singer'),('sunidhi chauhan','hindi',1.7,'singer'),
  ('honey singh','hindi',1.5,'singer'),('badshah','hindi',1.5,'singer'),
  ('stebin ben','hindi',1.3,'singer'),('shaan','hindi',1.4,'singer'),
  ('kk','hindi',1.7,'singer'),('mohit chauhan','hindi',1.6,'singer'),
  ('mika singh','hindi',1.4,'singer'),('palak muchhal','hindi',1.4,'singer'),
  ('tulsi kumar','hindi',1.4,'singer'),('rahat fateh ali khan','hindi',1.8,'singer'),
  ('sachet tandon','hindi',1.4,'singer'),('parampara tandon','hindi',1.4,'singer'),
  ('sachin-jigar','hindi',1.6,'composer'),('tanishk bagchi','hindi',1.5,'composer'),
  ('guru randhawa','hindi',1.5,'singer'),('dhvani bhanushali','hindi',1.4,'singer'),
  ('raftaar','hindi',1.4,'singer'),('amit trivedi','hindi',1.6,'composer'),
  ('shankar ehsaan loy','hindi',1.6,'composer'),('vishal-shekhar','hindi',1.6,'composer'),
  ('himesh reshammiya','hindi',1.5,'both'),('diljit dosanjh','hindi',1.6,'singer'),
  ('harrdy sandhu','hindi',1.4,'singer'),('jasleen royal','hindi',1.4,'singer'),
  ('jonita gandhi','hindi',1.4,'singer'),('asees kaur','hindi',1.4,'singer'),
  ('sukhwinder singh','hindi',1.6,'singer'),('rekha bhardwaj','hindi',1.5,'singer'),
  ('papon','hindi',1.4,'singer'),('monali thakur','hindi',1.4,'singer'),
  ('ankit tiwari','hindi',1.4,'singer'),('amaal mallik','hindi',1.5,'composer');

-- Seed mood keywords (for Telugu songs that don't have tags yet)
INSERT OR REPLACE INTO mood_keywords (mood, keyword, lang) VALUES
  ('romantic','premichesa','telugu'),('romantic','prema','telugu'),('romantic','love','both'),
  ('romantic','hrudayam','telugu'),('romantic','pyaar','hindi'),('romantic','ishq','hindi'),
  ('romantic','dil','hindi'),('romantic','mohabbat','hindi'),('romantic','heeriye','hindi'),
  ('party','dance','both'),('party','party','both'),('party','nachche','hindi'),
  ('party','rangu','telugu'),('party','jhoom','hindi'),('party','thumka','hindi'),
  ('party','beat','both'),('sad','virahan','telugu'),('sad','alone','both'),
  ('sad','bewafa','hindi'),('sad','judaai','hindi'),('sad','tanhai','hindi'),
  ('sufi','khuda','hindi'),('sufi','allah','hindi'),('sufi','dargah','hindi'),
  ('chill','melody','both'),('chill','slow','both'),
  ('workout','power','both'),('workout','beast','both'),('workout','mass','telugu');
