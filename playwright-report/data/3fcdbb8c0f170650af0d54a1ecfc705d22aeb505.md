# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e7]: NARRAVIT
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: "1"
        - generic [ref=e12]: "2"
        - generic [ref=e13]: "3"
      - generic [ref=e15]:
        - heading "Für wen ist das Lebensbuch?" [level=2] [ref=e16]
        - paragraph [ref=e17]: Du kannst es für dich selbst anlegen oder als Geschenk für jemanden.
        - generic [ref=e18]:
          - button "Für mich selbst Ich möchte mein eigenes Lebensbuch schreiben." [ref=e19] [cursor=pointer]:
            - paragraph [ref=e20]: Für mich selbst
            - paragraph [ref=e21]: Ich möchte mein eigenes Lebensbuch schreiben.
          - button "Als Geschenk Ich schenke jemand anderem ein Lebensbuch." [ref=e22] [cursor=pointer]:
            - paragraph [ref=e23]: Als Geschenk
            - paragraph [ref=e24]: Ich schenke jemand anderem ein Lebensbuch.
      - generic [ref=e25]:
        - link "Zurück" [ref=e26] [cursor=pointer]:
          - /url: /
        - button "Weiter" [active] [ref=e27] [cursor=pointer]
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e33] [cursor=pointer]:
    - img [ref=e34]
  - alert [ref=e37]
```