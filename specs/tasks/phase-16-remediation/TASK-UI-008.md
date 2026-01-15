<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-008</task_id>
    <title>Remove Backup Files</title>
    <type>housekeeping</type>
    <priority>LOW</priority>
    <severity>LOW</severity>
    <estimated_effort>30 minutes</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <tags>cleanup, git, repository-hygiene, code-quality</tags>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      Backup files with .bak extension have been committed to the repository. These files
      add clutter, increase repository size, and may contain outdated or sensitive code.
      Backup files should never be committed to version control.
    </issue_description>
    <current_behavior>
      - .bak files present in apps/web/ directory
      - Backup files tracked by git
      - Repository size increased unnecessarily
      - Potential confusion about which files are current
    </current_behavior>
    <impact>
      - Repository clutter and increased size
      - Confusion about file versions
      - Potential exposure of old/sensitive code
      - Poor repository hygiene practices
    </impact>
  </context>

  <scope>
    <files_to_delete>
      <pattern>apps/web/**/*.bak</pattern>
      <pattern>**/*.bak</pattern>
      <pattern>**/*.backup</pattern>
      <pattern>**/*.orig</pattern>
    </files_to_delete>
    <files_to_modify>
      <file path=".gitignore" action="modify">
        Add patterns to prevent future backup file commits
      </file>
    </files_to_modify>
  </scope>

  <implementation>
    <step order="1" description="Find all backup files">
      <action>
        ```bash
        # Find all backup files in repository
        find . -name "*.bak" -type f
        find . -name "*.backup" -type f
        find . -name "*.orig" -type f
        find . -name "*~" -type f

        # Or using git
        git ls-files | grep -E '\.(bak|backup|orig)$'
        ```
      </action>
    </step>
    <step order="2" description="Remove backup files from repository">
      <action>
        ```bash
        # Remove from git tracking and filesystem
        git rm --cached $(git ls-files | grep -E '\.(bak|backup|orig)$')

        # Or remove files directly
        find apps/web -name "*.bak" -type f -delete
        ```
      </action>
    </step>
    <step order="3" description="Update .gitignore">
      <action>
        ```gitignore
        # .gitignore additions

        # Backup files
        *.bak
        *.backup
        *.orig
        *~

        # Editor backup files
        *.swp
        *.swo
        *~
        \#*\#
        .#*

        # IDE backup/temp files
        *.tmp
        *.temp
        ```
      </action>
    </step>
    <step order="4" description="Commit the cleanup">
      <action>
        ```bash
        git add .gitignore
        git add -u  # Stage all deletions
        git commit -m "chore: remove backup files and update .gitignore"
        ```
      </action>
    </step>
    <step order="5" description="Verify no backup files remain">
      <action>
        ```bash
        # Verify no backup files in working directory
        find . -name "*.bak" -type f | wc -l  # Should be 0

        # Verify no backup files tracked by git
        git ls-files | grep -E '\.(bak|backup|orig)$' | wc -l  # Should be 0
        ```
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="No .bak files in repository">
        Run: git ls-files | grep "\.bak$" - Should return empty
      </test>
      <test name="No .bak files in filesystem">
        Run: find . -name "*.bak" - Should return empty
      </test>
      <test name=".gitignore updated">
        Verify .gitignore contains *.bak pattern
      </test>
      <test name="New .bak files ignored">
        Create test.bak, verify git status shows untracked but gitignore prevents add
      </test>
    </test_cases>
    <commands>
      <command>git ls-files | grep -E '\.(bak|backup|orig)$'</command>
      <command>find . -type f -name "*.bak" 2>/dev/null</command>
      <command>grep "\.bak" .gitignore</command>
    </commands>
  </verification>

  <definition_of_done>
    <criteria>
      <item>All .bak files removed from repository</item>
      <item>All .backup files removed from repository</item>
      <item>All .orig files removed from repository</item>
      <item>.gitignore updated with backup file patterns</item>
      <item>New backup files are automatically ignored</item>
      <item>Commit created documenting the cleanup</item>
      <item>Repository size reduced (if significant)</item>
    </criteria>
  </definition_of_done>
</task_specification>
