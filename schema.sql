-- LOOM — MySQL Setup Script
-- Run once to create the database and tables:
--   mysql -u root -p < schema.sql
--
-- After tables are created, seed via:
--   curl -X POST http://localhost:5000/api/seed
-- OR uncomment the INSERT block at the bottom.

CREATE DATABASE IF NOT EXISTS loom_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE loom_db;

CREATE TABLE IF NOT EXISTS complaints (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    anon_id    VARCHAR(10)  NOT NULL,
    category   VARCHAR(50)  NOT NULL,
    title      VARCHAR(200) NOT NULL,
    body       TEXT         NOT NULL,
    priority   ENUM('low','medium','high')                       DEFAULT 'medium',
    status     ENUM('pending','in-review','critical','resolved') DEFAULT 'pending',
    votes      INT          NOT NULL DEFAULT 0,
    flagged    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS votes (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT         NOT NULL,
    voter_ip     VARCHAR(45) NOT NULL,
    voted_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    UNIQUE KEY uq_one_vote_per_ip (complaint_id, voter_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Sample seed data ──────────────────────────────────────────
-- Uncomment if you prefer SQL seeding over the /api/seed endpoint.


INSERT INTO complaints (anon_id, category, title, body, priority, status, votes, flagged) VALUES
('#a7f2','Infrastructure','Broken projectors in Block C classrooms',
 'Projectors in rooms C201, C202, and C204 have been non-functional for over 3 weeks. Multiple faculty have complained but no action has been taken. This seriously affects lecture quality.',
 'high','critical',23,1),

('#b3e9','Canteen','Food quality has significantly declined',
 'The canteen food quality has dropped drastically in the past month. Found insects in food on two occasions. Prices have increased but quality is much worse. Many students are now skipping meals.',
 'high','in-review',18,0),

('#c1d4','Hostel','Hot water not available in Hostel Block B',
 'Hot water has not been available in Hostel B for 10 days. Maintenance keeps saying it will be fixed tomorrow. This is affecting hygiene especially during cold mornings.',
 'medium','in-review',14,0),

('#d8f1','Academic','Attendance portal shows wrong data',
 'The attendance portal is showing incorrect attendance for multiple students. Some who attended all lectures are showing below 75% attendance, affecting exam eligibility.',
 'high','critical',31,1),

('#e2b7','Library','Library closes 2 hours before scheduled time',
 'The library has been closing at 6pm instead of the scheduled 8pm for the past 2 weeks. No notice was given. Students who stay for evening self-study are being affected.',
 'medium','pending',7,0),

('#f9c3','Safety','Streetlights near parking not working',
 'The streetlights near the main parking area have been out for a week. Students leaving late evenings feel unsafe. The path between the lab block and hostel is completely dark at night.',
 'high','pending',9,0),

('#g4d8','Infrastructure','WiFi dead zones on 3rd and 4th floor',
 'The WiFi signal is completely absent on the 3rd and 4th floors of the academic building. This has been reported multiple times but no additional access points have been installed.',
 'medium','resolved',15,0),

('#h2k9','Administration','Fee receipts not issued on time',
 'Students who paid fees 3 weeks ago have not yet received receipts. This is causing issues during document verification and scholarship applications.',
 'medium','pending',5,0);
