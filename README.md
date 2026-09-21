# Kashyap Adhikari Family Tree

[![Owner](https://img.shields.io/badge/Owner-Jyphra%20Technology%20Pvt.%20Ltd.-blue)]()
[![Status](https://img.shields.io/badge/Status-In%20Development-yellow)]()
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS%20%7C%20Web-green)]()

## Overview

The **Kashyap Adhikari Family Tree** is a comprehensive genealogy and community platform for the Kashyap Adhikari community. It provides:

- 📱 **Mobile Applications** (Android & iOS) for family tree visualization and community interaction
- 🖥️ **Administration Portal** for community management and governance
- 🔗 **Secure APIs** for genealogy graph processing, communication, and data management
- 🌐 **Bilingual Support** (Nepali 🇳🇵 and English 🇬🇧)

## Key Features

- **Authentication & Identity**: OTP-based phone authentication with Account–Person separation
- **Genealogy Management**: Interactive family tree with history, claims, verification, corrections, disputes, and merges
- **Nata/Saino Computation**: Culturally-aware relationship computation with configurable rules
- **Community Communication**: Chat, posts, events, RSVP, and notifications
- **Cultural Content**: Tithi, Shraddha, and cultural event management
- **Privacy & Security**: Role-based access, branch-scoped administration, consent management, and audit trails
- **Administration**: Moderation, appeals, delegation, and separation of duties

## Project Structure

```
kashyap_family_tree/
├── docs/                          # Documentation
│   ├── baseline/                  # Frozen baseline specifications (v1.1)
│   ├── execution/                 # Implementation tracking documents
│   ├── architecture/              # Architecture Decision Records
│   ├── api/                       # API contracts and specifications
│   ├── guides/                    # Developer and user guides
│   └── privacy/                   # Privacy and data policies
├── mobile/                        # Flutter mobile application
│   ├── lib/                       # Dart source code
│   ├── android/                   # Android platform files
│   ├── ios/                       # iOS platform files
│   └── test/                      # Mobile tests
├── admin/                         # Administration portal
├── backend/                       # Backend services
│   ├── api/                       # REST/GraphQL API
│   ├── workers/                   # Background job processors
│   └── migrations/                # Database migrations
├── infra/                         # Infrastructure as Code
├── scripts/                       # Build, deploy, and utility scripts
└── .github/                       # GitHub Actions CI/CD
```

## Getting Started

### Prerequisites

- Windows development machine with `D:\` drive
- Git 2.40+
- Flutter SDK 3.x
- Node.js 20 LTS (for admin portal)
- Docker Desktop (configured on D: drive)

### Setup

See [Developer Setup Guide](docs/guides/DEVELOPER_SETUP.md) for detailed instructions.

```bash
# Clone the repository
git clone https://github.com/rahulgupta32/kashyap_family_tree.git D:\Jyphra\kashyap_family_tree
```

## Documentation

| Document | Description |
|----------|-------------|
| [Implementation Plan](docs/execution/IMPLEMENTATION_PLAN.md) | Detailed implementation roadmap |
| [Requirements Traceability](docs/execution/REQUIREMENTS_TRACEABILITY_MATRIX.md) | Requirements to implementation mapping |
| [Status](docs/execution/STATUS.md) | Current development status |
| [Architecture Decisions](docs/architecture/ADR/) | Architecture Decision Records |
| [Security Policy](SECURITY.md) | Vulnerability reporting |
| [Contributing](CONTRIBUTING.md) | Development guidelines |

## License

All rights reserved. This software is proprietary to **Jyphra Technology Pvt. Ltd.**  
See [LICENSE_DECISION_REQUIRED.md](LICENSE_DECISION_REQUIRED.md) for details.

## Contact

**Jyphra Technology Pvt. Ltd.**  
Repository: [github.com/rahulgupta32/kashyap_family_tree](https://github.com/rahulgupta32/kashyap_family_tree)
