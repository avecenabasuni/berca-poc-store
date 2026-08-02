BEGIN {
  FS = "|"
}

NR == 1 {
  for (i = 1; i <= NF; i++) {
    column[$i] = i
  }

  valid = ("database" in column) &&
    ("user" in column) &&
    ("cl_waiting" in column) &&
    ("sv_active" in column)
  next
}

valid && $(column["database"]) == target_db &&
  $(column["user"]) == target_user {
  count++
  waiting = $(column["cl_waiting"])
  active = $(column["sv_active"])
}

END {
  if (!valid) {
    exit 2
  }

  if (count == 0) {
    print "0|0|0"
  } else if (count == 1) {
    print "1|" waiting "|" active
  } else {
    print count "|-1|-1"
  }
}
