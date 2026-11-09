import { Table, Column, Model, DataType } from "sequelize-typescript";

// Where the change detection job left off in the Brreg update feed.
// The table holds a single row.
@Table({ tableName: "brreg_sync_state", underscored: true })
export class BrregSyncState extends Model {
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // BIGINT columns are returned as strings by the pg driver
  @Column({ type: DataType.BIGINT, allowNull: false })
  declare lastUpdateId: string;

  // Position in the role update feed, which has its own ids.
  // null until change detection has started reading the role feed.
  @Column({ type: DataType.BIGINT, allowNull: true })
  declare lastRoleEventId: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastRunAt: Date | null;
}