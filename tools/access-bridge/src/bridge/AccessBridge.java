package bridge;

import com.healthmarketscience.jackcess.Column;
import com.healthmarketscience.jackcess.CryptCodecProvider;
import com.healthmarketscience.jackcess.DataType;
import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Row;
import com.healthmarketscience.jackcess.Table;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public final class AccessBridge {
  private static final int DEFAULT_PREVIEW_LIMIT = 3;

  private AccessBridge() {}

  public static void main(String[] args) throws Exception {
    if (args.length < 3) {
      System.err.println(
          "Usage: bridge.AccessBridge <tables|schema|columns|preview|export-table> <dbPath> <password> [table] [limit]");
      System.exit(1);
    }

    String command = args[0];
    String dbPath = args[1];
    String password = args[2];

    if ("tables".equals(command)) {
      try (Database database = openDatabase(dbPath, password)) {
        System.out.println(buildTablesJson(database));
      }
      return;
    }

    if ("schema".equals(command)) {
      int previewLimit = args.length >= 4 ? parsePositiveInt(args[3], DEFAULT_PREVIEW_LIMIT) : DEFAULT_PREVIEW_LIMIT;
      try (Database database = openDatabase(dbPath, password)) {
        System.out.println(buildSchemaJson(database, previewLimit));
      }
      return;
    }

    if ("columns".equals(command)) {
      if (args.length < 4) {
        throw new IllegalArgumentException("Table name is required for columns");
      }
      try (Database database = openDatabase(dbPath, password)) {
        System.out.println(buildColumnsOnlyJson(database, args[3]));
      }
      return;
    }

    if ("preview".equals(command) || "export-table".equals(command)) {
      if (args.length < 4) {
        throw new IllegalArgumentException("Table name is required for " + command);
      }
      String tableName = args[3];
      int limit =
          args.length >= 5
              ? parsePositiveInt(args[4], DEFAULT_PREVIEW_LIMIT)
              : ("preview".equals(command) ? DEFAULT_PREVIEW_LIMIT : Integer.MAX_VALUE);
      int offset = args.length >= 6 ? parsePositiveInt(args[5], 0) : 0;

      try (Database database = openDatabase(dbPath, password)) {
        System.out.println(buildTableJson(database, tableName, limit, offset));
      }
      return;
    }

    throw new IllegalArgumentException("Unknown command: " + command);
  }

  private static int parsePositiveInt(String raw, int fallback) {
    try {
      int value = Integer.parseInt(raw);
      return value > 0 ? value : fallback;
    } catch (NumberFormatException error) {
      return fallback;
    }
  }

  private static Database openDatabase(String dbPath, String password) throws Exception {
    DatabaseBuilder builder = new DatabaseBuilder(new File(dbPath));
    builder.setAutoSync(false);
    builder.setReadOnly(true);
    builder.setCodecProvider(new CryptCodecProvider(password));
    return builder.open();
  }

  private static String buildSchemaJson(Database database, int previewLimit) throws Exception {
    StringBuilder json = new StringBuilder();
    json.append("{\"tables\":[");

    List<String> tableNames = listUserTables(database);
    for (int index = 0; index < tableNames.size(); index++) {
      if (index > 0) {
        json.append(',');
      }

      String tableName = tableNames.get(index);
      json.append(buildTableSummaryJson(database, tableName, previewLimit));
    }

    json.append("]}");
    return json.toString();
  }

  private static String buildTablesJson(Database database) throws Exception {
    StringBuilder json = new StringBuilder();
    json.append("{\"tables\":[");

    List<String> tableNames = listUserTables(database);
    for (int index = 0; index < tableNames.size(); index++) {
      if (index > 0) {
        json.append(',');
      }
      json.append(toJson(tableNames.get(index)));
    }

    json.append("]}");
    return json.toString();
  }

  private static List<String> listUserTables(Database database) throws Exception {
    List<String> names = new ArrayList<>();

    for (String tableName : database.getTableNames()) {
      Table table = database.getTable(tableName);
      if (table == null || table.isSystem() || isSystemTable(tableName)) {
        continue;
      }
      names.add(tableName);
    }

    return names;
  }

  private static boolean isSystemTable(String tableName) {
    String normalized = tableName.toLowerCase(Locale.ROOT);
    return normalized.startsWith("msys") || normalized.startsWith("usys") || normalized.startsWith("~");
  }

  private static String buildTableSummaryJson(Database database, String tableName, int previewLimit)
      throws Exception {
    Table table = requireTable(database, tableName);
    StringBuilder json = new StringBuilder();
    json.append('{');
    json.append("\"name\":").append(toJson(tableName)).append(',');
    json.append("\"rowCount\":").append(table.getRowCount()).append(',');
    json.append("\"columns\":").append(buildColumnsJson(table)).append(',');
    json.append("\"preview\":").append(buildRowsJson(table, previewLimit, 0));
    json.append('}');
    return json.toString();
  }

  private static String buildColumnsJson(Table table) throws Exception {
    StringBuilder json = new StringBuilder();
    json.append('[');
    boolean first = true;

    for (Column column : table.getColumns()) {
      if (!first) {
        json.append(',');
      }
      first = false;

      DataType type = column.getType();
      json.append('{');
      json.append("\"name\":").append(toJson(column.getName())).append(',');
      json.append("\"typeName\":").append(toJson(type.name())).append(',');
      json.append("\"dataType\":").append(getSqlType(column)).append(',');
      json.append("\"size\":").append(column.getLength()).append(',');
      json.append("\"nullable\":").append(true);
      json.append('}');
    }

    json.append(']');
    return json.toString();
  }

  private static String buildTableJson(Database database, String tableName, int limit, int offset) throws Exception {
    Table table = requireTable(database, tableName);
    StringBuilder json = new StringBuilder();
    json.append('{');
    json.append("\"name\":").append(toJson(tableName)).append(',');
    json.append("\"rowCount\":").append(table.getRowCount()).append(',');
    json.append("\"columns\":").append(buildColumnsJson(table)).append(',');
    json.append("\"rows\":").append(buildRowsJson(table, limit, offset));
    json.append('}');
    return json.toString();
  }

  private static String buildColumnsOnlyJson(Database database, String tableName) throws Exception {
    Table table = requireTable(database, tableName);
    return "{\"name\":" + toJson(tableName) + ",\"columns\":" + buildColumnsJson(table) + "}";
  }

  private static String buildRowsJson(Table table, int limit, int offset) throws Exception {
    StringBuilder json = new StringBuilder();
    json.append('[');

    boolean firstRow = true;
    int skipped = 0;
    int added = 0;
    Iterator<Row> iterator = table.iterator();

    while (iterator.hasNext()) {
      Row row = iterator.next();
      if (skipped < offset) {
        skipped++;
        continue;
      }

      if (limit != Integer.MAX_VALUE && added >= limit) {
        break;
      }

      if (!firstRow) {
        json.append(',');
      }
      firstRow = false;
      added++;

      json.append('{');
      int columnIndex = 0;
      for (Column column : table.getColumns()) {
        if (columnIndex > 0) {
          json.append(',');
        }
        columnIndex++;
        json.append(toJson(column.getName())).append(':');
        json.append(toJsonValue(row.get(column.getName())));
      }
      json.append('}');
    }

    json.append(']');
    return json.toString();
  }

  private static Table requireTable(Database database, String tableName) throws Exception {
    Table table = database.getTable(tableName);
    if (table == null) {
      throw new IllegalArgumentException("Table not found: " + tableName);
    }
    return table;
  }

  private static int getSqlType(Column column) {
    try {
      return column.getSQLType();
    } catch (Exception error) {
      return Integer.MIN_VALUE;
    }
  }

  private static String toJsonValue(Object value) {
    if (value == null) {
      return "null";
    }

    if (value instanceof Number || value instanceof Boolean) {
      return String.valueOf(value);
    }

    if (value instanceof Date) {
      return toJson(formatDate((Date) value));
    }

    if (value instanceof byte[]) {
      return toJson(Base64.getEncoder().encodeToString((byte[]) value));
    }

    return toJson(String.valueOf(value));
  }

  private static String formatDate(Date value) {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
    format.setTimeZone(TimeZone.getTimeZone("UTC"));
    return format.format(value);
  }

  private static String toJson(String value) {
    if (value == null) {
      return "null";
    }

    StringBuilder escaped = new StringBuilder();
    escaped.append('"');
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      switch (character) {
        case '\\':
          escaped.append("\\\\");
          break;
        case '"':
          escaped.append("\\\"");
          break;
        case '\b':
          escaped.append("\\b");
          break;
        case '\f':
          escaped.append("\\f");
          break;
        case '\n':
          escaped.append("\\n");
          break;
        case '\r':
          escaped.append("\\r");
          break;
        case '\t':
          escaped.append("\\t");
          break;
        default:
          if (character < 0x20) {
            escaped.append(String.format("\\u%04x", (int) character));
          } else {
            escaped.append(character);
          }
      }
    }
    escaped.append('"');
    return escaped.toString();
  }
}
