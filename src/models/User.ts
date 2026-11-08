import { Table, Column, Model, DataType } from "sequelize-typescript";

@Table({ tableName: "users", underscored: true })
export class User extends Model {
  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare passwordHash: string;
}
