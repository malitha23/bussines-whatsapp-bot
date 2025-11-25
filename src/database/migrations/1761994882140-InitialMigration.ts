import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMigration1761994882140 implements MigrationInterface {
  name = 'InitialMigration1761994882140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`product_subsub_categories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`subcategoryId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`product_subcategories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`categoryId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`product_categories\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`businessId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`customers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`phone\` varchar(255) NOT NULL, \`email\` varchar(255) NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, UNIQUE INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` (\`phone\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`subscription_plans\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`price\` decimal(10,2) NOT NULL, \`duration_days\` int NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`subscriptions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`businessId\` int NULL, \`planId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`businesses\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`email\` varchar(255) NOT NULL, \`phone\` varchar(255) NOT NULL, \`address\` varchar(255) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`ownerId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NOT NULL, \`phone\` varchar(255) NULL, \`role_type\` enum ('super_admin', 'owner', 'manager', 'staff') NOT NULL DEFAULT 'staff', \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`business_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`action\` varchar(255) NOT NULL, \`description\` text NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`whatsapp_sessions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`session_data\` text NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`messages\` (\`id\` int NOT NULL AUTO_INCREMENT, \`message_text\` text NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'sent', \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, \`customerId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`products\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`price\` decimal(10,2) NOT NULL, \`description\` varchar(255) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, \`subsubCategoryId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`orders\` (\`id\` int NOT NULL AUTO_INCREMENT, \`total_amount\` decimal(10,2) NOT NULL, \`status\` varchar(255) NOT NULL DEFAULT 'pending', \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`businessId\` int NULL, \`customerId\` int NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` ADD CONSTRAINT \`FK_ae6879221a152e5a349ad846344\` FOREIGN KEY (\`subcategoryId\`) REFERENCES \`product_subcategories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` ADD CONSTRAINT \`FK_a3ceae719e4fd83066e83d8371b\` FOREIGN KEY (\`categoryId\`) REFERENCES \`product_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` ADD CONSTRAINT \`FK_408cd327d592771780bb6a759df\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` ADD CONSTRAINT \`FK_652f05fd67ef9354cb047aae572\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7e9f8a764f844a37dc4a968494a\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`FK_7536cba909dd7584a4640cad7d5\` FOREIGN KEY (\`planId\`) REFERENCES \`subscription_plans\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` ADD CONSTRAINT \`FK_02e7bfb8e766e8e0ef449cc0f36\` FOREIGN KEY (\`ownerId\`) REFERENCES \`users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` ADD CONSTRAINT \`FK_3b1f2fb3e2c5094da0d71cb5c6f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` ADD CONSTRAINT \`FK_b92819d35788ce4f13232c8f17f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_2234441aac965d27bd93edb33d6\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` ADD CONSTRAINT \`FK_cd3cd1906c2198f36dc5e7fe4d4\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_359bd8406fbfb50e3ea42b5631f\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` ADD CONSTRAINT \`FK_a1eac2ff237dae6d166c340c71b\` FOREIGN KEY (\`subsubCategoryId\`) REFERENCES \`product_subsub_categories\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_778777c5d7d56ed1bbaa907b8e5\` FOREIGN KEY (\`businessId\`) REFERENCES \`businesses\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_e5de51ca888d8b1f5ac25799dd1\` FOREIGN KEY (\`customerId\`) REFERENCES \`customers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_e5de51ca888d8b1f5ac25799dd1\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_778777c5d7d56ed1bbaa907b8e5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_a1eac2ff237dae6d166c340c71b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_359bd8406fbfb50e3ea42b5631f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_cd3cd1906c2198f36dc5e7fe4d4\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`messages\` DROP FOREIGN KEY \`FK_2234441aac965d27bd93edb33d6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`whatsapp_sessions\` DROP FOREIGN KEY \`FK_b92819d35788ce4f13232c8f17f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`business_logs\` DROP FOREIGN KEY \`FK_3b1f2fb3e2c5094da0d71cb5c6f\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`businesses\` DROP FOREIGN KEY \`FK_02e7bfb8e766e8e0ef449cc0f36\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7536cba909dd7584a4640cad7d5\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`subscriptions\` DROP FOREIGN KEY \`FK_7e9f8a764f844a37dc4a968494a\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`customers\` DROP FOREIGN KEY \`FK_652f05fd67ef9354cb047aae572\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_categories\` DROP FOREIGN KEY \`FK_408cd327d592771780bb6a759df\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subcategories\` DROP FOREIGN KEY \`FK_a3ceae719e4fd83066e83d8371b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`product_subsub_categories\` DROP FOREIGN KEY \`FK_ae6879221a152e5a349ad846344\``,
    );
    await queryRunner.query(`DROP TABLE \`orders\``);
    await queryRunner.query(`DROP TABLE \`products\``);
    await queryRunner.query(`DROP TABLE \`messages\``);
    await queryRunner.query(`DROP TABLE \`whatsapp_sessions\``);
    await queryRunner.query(`DROP TABLE \`business_logs\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``,
    );
    await queryRunner.query(`DROP TABLE \`users\``);
    await queryRunner.query(`DROP TABLE \`businesses\``);
    await queryRunner.query(`DROP TABLE \`subscriptions\``);
    await queryRunner.query(`DROP TABLE \`subscription_plans\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_88acd889fbe17d0e16cc4bc917\` ON \`customers\``,
    );
    await queryRunner.query(`DROP TABLE \`customers\``);
    await queryRunner.query(`DROP TABLE \`product_categories\``);
    await queryRunner.query(`DROP TABLE \`product_subcategories\``);
    await queryRunner.query(`DROP TABLE \`product_subsub_categories\``);
  }
}
