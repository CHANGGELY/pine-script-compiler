# Security Policy | 安全政策

## Reporting a Vulnerability | 漏洞上报
- Please email a private report to maintainers (open an issue marked `security` only for general questions).
- Include steps to reproduce, affected versions, and impact.
- We will acknowledge receipt within 72 hours and provide a timeline for fixes.

## Supported Versions | 支持版本
- We aim to keep `main` secure; release branches will receive patches as needed.

## Best Practices | 安全建议
- Avoid eval and non-literal regex/fs/require in user input paths.
- Prefer explicit whitelists and input validation.
- Use latest LTS Node and updated dependencies.

感谢你帮助我们共同维护项目安全。
